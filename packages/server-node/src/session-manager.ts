import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';

import { spawn, type IDisposable, type IPty } from 'node-pty';
import {
  KEY_BYTES,
  type CreateSessionInput,
  type CreateSessionOutput,
  type KillInput,
  type KillOutput,
  type ListSessionItem,
  type ListSessionsOutput,
  type PressKeyInput,
  type PressKeyOutput,
  type ReadOutputInput,
  type ReadOutputOutput,
  type SendInputInput,
  type SendInputOutput,
  type SendTextInput,
  type SendTextOutput,
} from '@continuo-terminal/protocol';

const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

type BufferChunk = {
  data: string;
  seq: number;
  bytes: number;
};

/** @internal Exported for unit tests; not part of the package's public API. */
export class SessionBuffer {
  private chunks: BufferChunk[] = [];
  private totalBytes = 0;
  private nextSeq = 1;

  push(data: string): void {
    const bytes = Buffer.byteLength(data, 'utf8');
    this.chunks.push({ data, seq: this.nextSeq, bytes });
    this.nextSeq += 1;
    this.totalBytes += bytes;

    while (this.totalBytes > MAX_BUFFER_BYTES && this.chunks.length > 0) {
      const removed = this.chunks.shift();
      if (!removed) {
        break;
      }
      this.totalBytes -= removed.bytes;
    }
  }

  // truncated is computed per-read from oldest retained seq vs requested cursor:
  // if the buffer no longer contains seq=since_seq+1 (because it was dropped),
  // the consumer has a gap and the read is truncated. Once they catch up to
  // the new oldest, subsequent reads are no longer truncated. There is no
  // sticky drop flag — a single drop in the past must not poison every
  // future read on this session.
  readSince(sinceSeq = 0): { chunks: BufferChunk[]; nextSeq: number; truncated: boolean } {
    const chunks = this.chunks.filter((chunk) => chunk.seq > sinceSeq);
    return {
      chunks,
      nextSeq: this.nextSeq,
      truncated: (this.chunks[0]?.seq ?? this.nextSeq) > sinceSeq + 1,
    };
  }
}

type SessionState = {
  id: string;
  pty: IPty;
  buffer: SessionBuffer;
  createdAt: number;
  cwd: string;
  title: string;
  exitCode: number | null;
  disposables: IDisposable[];
};

function stripAnsi(input: string): string {
  return input.replace(
    // Covers CSI, OSC, and common single-character ANSI escape sequences.
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    '',
  );
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();

  async create(input: CreateSessionInput): Promise<CreateSessionOutput> {
    const id = randomUUID();
    const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
    const shell = input.shell ?? process.env.SHELL ?? '/bin/zsh';
    const cols = input.cols ?? DEFAULT_COLS;
    const rows = input.rows ?? DEFAULT_ROWS;
    const title = input.name || path.basename(cwd) || 'terminal';
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: process.env.TERM || 'xterm-256color' },
    });
    const buffer = new SessionBuffer();
    const state: SessionState = {
      id,
      pty,
      buffer,
      createdAt: Date.now(),
      cwd,
      title,
      exitCode: null,
      disposables: [],
    };

    state.disposables.push(
      pty.onData((chunk) => {
        buffer.push(chunk);
      }),
    );
    state.disposables.push(
      pty.onExit(({ exitCode }) => {
        state.exitCode = exitCode;
        this.removeSession(id);
      }),
    );

    this.sessions.set(id, state);

    if (input.autorun) {
      setTimeout(() => {
        if (this.sessions.has(id)) {
          pty.write(`${input.autorun}\r`);
        }
      }, 200);
    }

    return { session_id: id, pid: pty.pid };
  }

  async list(): Promise<ListSessionsOutput> {
    const sessions: ListSessionItem[] = [...this.sessions.values()].map((session) => ({
      session_id: session.id,
      title: session.title,
      cwd: session.cwd,
      origin: 'user',
      created_at: session.createdAt,
      exit_code: session.exitCode,
    }));
    return { sessions };
  }

  async sendInput(input: SendInputInput): Promise<SendInputOutput> {
    this.getSession(input.session_id).pty.write(input.data);
    return {};
  }

  async sendText(input: SendTextInput): Promise<SendTextOutput> {
    this.getSession(input.session_id).pty.write(input.text);
    return {};
  }

  async pressKey(input: PressKeyInput): Promise<PressKeyOutput> {
    this.getSession(input.session_id).pty.write(KEY_BYTES[input.key]);
    return {};
  }

  async readOutput(input: ReadOutputInput): Promise<ReadOutputOutput> {
    const { chunks, nextSeq, truncated } = this.getSession(input.session_id).buffer.readSince(input.since_seq);
    const text = chunks.map((chunk) => chunk.data).join('');
    const normalized = input.strip_ansi ? stripAnsi(text) : text;
    let lines = normalized.split(/\r?\n/);
    if (lines.at(-1) === '') {
      lines = lines.slice(0, -1);
    }

    const maxLines = input.max_lines ?? lines.length;
    const limited = lines.slice(Math.max(0, lines.length - maxLines));

    return {
      lines: limited,
      next_seq: nextSeq,
      truncated: truncated || limited.length < lines.length,
    };
  }

  async kill(input: KillInput): Promise<KillOutput> {
    const session = this.sessions.get(input.session_id);
    if (!session) {
      return {};
    }

    try {
      session.pty.kill(input.signal ?? 'SIGTERM');
    } finally {
      this.removeSession(input.session_id);
    }

    return {};
  }

  dispose(): void {
    for (const id of [...this.sessions.keys()]) {
      void this.kill({ session_id: id, signal: 'SIGTERM' });
    }
  }

  private getSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    for (const disposable of session.disposables) {
      disposable.dispose();
    }
    this.sessions.delete(sessionId);
  }
}

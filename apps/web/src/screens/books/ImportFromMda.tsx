// "Import from MDA" on Company & Year Setup: pick MDA-Inventory's data folder (the one holding
// MDA_Registry.db) and its companies, years and books are copied into this account. A web-only
// addition; MDA has no import. Reading is in lib/mda-import.ts, mapping on the server.

import { importMessages } from '@qi/core';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap } from '../../api.ts';
import { MessageDialog } from '../../components/Dialog.tsx';
import { OutlineButton } from '../../components/ledger.tsx';
import { MdaFolderError, readMdaFolder } from '../../lib/mda-import.ts';

type Message = { kind: 'ok' | 'error'; text: string };

export function ImportFromMda() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function run(files: File[]) {
    setBusy(true);
    try {
      const payload = await readMdaFolder(files);
      const res = await unwrap(api.api.import.mda.$post({ json: payload }));
      await queryClient.invalidateQueries({ queryKey: ['book-index'] });
      setMessage({
        kind: 'ok',
        text: [
          ...res.imported.map((c) => importMessages.imported(c.compName, c.years)),
          ...res.skipped.map(importMessages.exists),
        ].join('\n'),
      });
    } catch (err) {
      const text =
        err instanceof MdaFolderError || err instanceof ApiError
          ? err.message
          : 'Could not read the MDA files. Please try again.';
      setMessage({ kind: 'error', text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        // Folder picker in desktop browsers; phones fall back to picking the .db files.
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void run(files);
        }}
      />
      <OutlineButton type="button" disabled={busy} onClick={() => input.current?.click()}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19h16" />
        </svg>
        {busy ? 'Importing…' : 'Import from MDA'}
      </OutlineButton>
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={['Import from', 'MDA']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
}

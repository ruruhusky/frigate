import { h, Fragment } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import Dialog from './Dialog';
import { useApiHost } from '../api';
import { useRestart } from '../api/mqtt';

export default function DialogRestart({ show, setShow }) {
  const apiHost = useApiHost();
  const { payload: detectRestarted = null, send: sendRestart } = useRestart();
  const [dialogTitle, setDialogTitle] = useState('Restart in progress');

  useEffect(() => {
    if (detectRestarted != null && Number.isInteger(detectRestarted)) {
      if (!detectRestarted)
        setDialogTitle('Server-initiated startup');
      setShow(false);
    }
  }, [detectRestarted]);

  const waitPlease = async () => {
    const delay = ms => new Promise(res => setTimeout(res, ms));
    await delay(3456);
    while (true) {
      try {
        const response = await fetch(`${apiHost}/api/config`, { method: 'GET' });
        if (await response.status == 200)
          window.location.reload();
      }
      catch (e) {}
      await delay(987);
    }
  };

  const handleClick = useCallback(() => {
    sendRestart();
    setShow(false);
    waitPlease();
  });

  const handleDismiss = useCallback(() => {
    setShow(false);
  });

  return (
    <Fragment>
      {show ? (
        <Dialog
          onDismiss={handleDismiss}
          title="Restart Frigate"
          text="Are you sure?"
          actions={[
            { text: 'Yes', color: 'red', onClick: handleClick },
            { text: 'Cancel', onClick: handleDismiss } ]}
        />
      ) : detectRestarted != null && (
        <Dialog title={dialogTitle} text="This page should refresh as soon as the server is up and running." />
      )}
    </Fragment>
  );
}

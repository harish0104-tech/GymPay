type NativeFileWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  mfcNativeFileSharing?: boolean;
};

export function canShareNativeFile() {
  const nativeWindow = window as NativeFileWindow;
  return Boolean(nativeWindow.ReactNativeWebView && nativeWindow.mfcNativeFileSharing);
}

export async function shareNativeFile(filename: string, mimeType: string, base64: string) {
  const nativeWindow = window as NativeFileWindow;
  if (!nativeWindow.ReactNativeWebView || !nativeWindow.mfcNativeFileSharing) {
    throw new Error('Install the latest MFC app to save this report.');
  }

  const id = crypto.randomUUID();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('mfc-native-file-sharing', listener);
      reject(new Error('The app did not respond while preparing the PDF.'));
    }, 30000);

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; error?: string }>).detail;
      if (detail?.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('mfc-native-file-sharing', listener);
      if (detail.error) reject(new Error(detail.error));
      else resolve();
    };

    window.addEventListener('mfc-native-file-sharing', listener);
    nativeWindow.ReactNativeWebView!.postMessage(JSON.stringify({
      type: 'MFC_SHARE_FILE',
      id,
      filename,
      mimeType,
      base64,
    }));
  });
}

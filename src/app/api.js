export async function api(method, payload) {
  if (!window.mf?.invoke) {
    throw new Error('The desktop bridge is unavailable. Start the app with npm run dev or launch the installed application.');
  }
  try {
    return await window.mf.invoke(method, payload);
  } catch (error) {
    if (error?.code === 'UNAUTHENTICATED' || error?.code === 'SESSION_EXPIRED') {
      window.dispatchEvent(new Event('mf:session-expired'));
    }
    throw error;
  }
}

export function errorMessage(error) {
  return error?.message || 'The operation could not be completed.';
}

export async function connectAuro(): Promise<string> {
  if (!window.mina) {
    throw new Error('Auro is not installed. This button talks to window.mina, not a mock.');
  }
  const accounts = await window.mina.requestAccounts();
  const address = accounts[0];
  if (!address) throw new Error('Auro returned no accounts.');
  return address;
}

export function auroAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.mina);
}

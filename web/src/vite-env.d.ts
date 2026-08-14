/// <reference types="vite/client" />

interface MinaProvider {
  requestAccounts(): Promise<string[]>;
  getAccounts?(): Promise<string[]>;
}

interface Window {
  mina?: MinaProvider;
}

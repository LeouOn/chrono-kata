interface ProcessEnv {
  NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ProcessEnv {}
  }
}

export {};

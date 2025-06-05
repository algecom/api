interface NewToken {
  value: string;
  expires_at: number;
};

interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export type { NewToken, OAuthTokens };
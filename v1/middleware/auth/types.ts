interface AuthJwtValue {
  uid: string;
  token: string;
  expires_at: number;
  keepToken?: boolean;
  platform: "facebook" | "email";
};

export type { AuthJwtValue };
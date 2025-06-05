interface FacebookUser {
  id: string;
  name: string;
  email: string;
  picture: URL;
};

interface FacebookApiConfig {
  clientId: string;
  clientSecret: string;
  apiVersion?: string;
}

interface FacebookPage {
  id: string;
  name: string;
  category: string;
  about?: string;
  fan_count?: number;
  followers_count?: number;
  link?: string;
  picture?: {
    data: {
      url: string;
    };
  };
  cover?: {
    source: string;
  };
  website?: string;
  location?: any;
  phone?: string;
  emails?: string[];
  whatsapp_number?: string;
  is_published?: boolean;
  verification_status?: string;
  [key: string]: any;
}

interface TokenInfo {
  app_id: string;
  type: string;
  application: string;
  data_access_expires_at: number;
  expires_at: number;
  is_valid: boolean;
  scopes: string[];
  user_id: string;
}

export type {
  FacebookApiConfig,
  FacebookUser,
  FacebookPage,
  TokenInfo
};
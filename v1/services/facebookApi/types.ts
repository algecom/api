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

interface FormatedFacebookMessages {
  message: {
    text: string;
    attachments?: {
      mime_type: string;
      size: number;
      url: string;
    }[];
  };
  from: string;
  to: string[];
  created_time: string;
}

interface FacebookWebhookPayload {
  object: "page";
  entry: FacebookEntry[];
}

interface FacebookEntry {
  id: string; // Page ID
  time: number; // Unix timestamp
  messaging: FacebookMessaging[];
}

interface FacebookMessaging {
  sender: {
    id: string; // PSID - Page-scoped user ID
  };
  recipient: {
    id: string; // Page ID
  };
  timestamp: number;
  message?: FacebookMessage;
  postback?: FacebookPostback;
  delivery?: FacebookDelivery;
  read?: FacebookRead;
  optin?: FacebookOptin;
}

interface FacebookMessage {
  mid: string;
  text?: string;
  attachments?: FacebookAttachment[];
  quick_reply?: {
    payload: string;
  };
  is_echo?: boolean;
  app_id?: string;
  metadata?: string;
}

interface FacebookAttachment {
  type: "image" | "audio" | "video" | "file" | "location" | "fallback";
  payload: {
    url?: string;
    sticker_id?: number;
    coordinates?: {
      lat: number;
      long: number;
    };
    [key: string]: any; // for other custom fields
  };
}

interface FacebookPostback {
  payload: string;
  title?: string;
  referral?: {
    ref?: string;
    source?: string;
    type?: string;
  };
}

interface FacebookDelivery {
  mids?: string[];
  watermark: number;
  seq: number;
}

interface FacebookRead {
  watermark: number;
  seq: number;
}

interface FacebookOptin {
  ref?: string;
  user_ref?: string;
}

interface FacebookMessageHistoryResponse {
  data: FacebookMessageHistory[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
}

interface FacebookMessageHistory {
  id: string;
  created_time: string; // ISO string
  message?: string;
  from: {
    id: string;
    name: string;
  };
  to?: {
    data: {
      id: string;
      name: string;
    }[];
  };
  attachments?: {
    data: FacebookAttachmentData[];
  };
}

interface FacebookAttachmentData {
  mime_type?: string;
  image_data?: {
    width: number;
    height: number;
    url?: string;
    // possibly more fields like URL, if available
  };
  file_url?: string;
  video_data?: {
    length: number;
    // other metadata
  };
  sticker_id?: number;
  [key: string]: any;
}

export type {
  FacebookApiConfig,
  FacebookUser,
  FacebookPage,
  TokenInfo,
  FacebookMessageHistoryResponse,
  FacebookMessageHistory,
  FacebookAttachmentData,
  FormatedFacebookMessages,
  FacebookWebhookPayload,
  FacebookEntry,
  FacebookMessaging,
  FacebookMessage,
  FacebookAttachment,
  FacebookPostback,
  FacebookDelivery,
  FacebookRead,
  FacebookOptin
};
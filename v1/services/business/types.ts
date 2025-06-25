import type { FacebookPage } from "../facebookApi/types";
import type { GoogleSpreadsheet } from "../googleApi/types";

interface BusinessDataUpdate {
  ai_behaviour: number;
  ai_system_prompt: string;
  status: number;
};

interface Business extends BusinessDataUpdate {
  uid: string;
  created_at: Date;
  updated_at: Date;
};

interface BusinessFacebookPage {
  business_uid: string;
  token: string;
  id: string;
};

interface BusinessUser {
  business_uid: string;
  user_uid: string;
};

interface BusinessGoogleSheet {
  business_uid: string;
  id: string;
};

interface BusinessInfo extends Business {
  facebook: FacebookPage;
  google: { spreadsheet?: GoogleSpreadsheet };
}

interface BusinessInfoJoin extends Business {
  google_sheet_id: string;
  facebook_page_id: string;
  facebook_page_token: string;
}

interface chatTestConversation {
  timestamp: Date;
  role: string;
  content: { text: string };
};  

interface ChatTestData {
  message: { text: string },
  conversation: chatTestConversation[],
  testAiSystemPrompt: string
}

interface MessageResponse {
  text: string;
  total_token_count: number;
}

export type { Business, BusinessFacebookPage, BusinessUser, BusinessInfo, BusinessInfoJoin, BusinessGoogleSheet, BusinessDataUpdate, ChatTestData, MessageResponse };
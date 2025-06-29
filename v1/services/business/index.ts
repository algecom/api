import db from "../../database";
import UserService from "../user";
import MCPService from "../mcp";
import GoogleApiService from "../googleApi";
import FacebookApiService from "../facebookApi";
import BaseApiClient from "../../plugins/baseApiClient";
import type { Business, BusinessUser, BusinessInfo, BusinessFacebookPage, BusinessInfoJoin, BusinessDataUpdate, ChatTestData } from "./types";
import type { GoogleSpreadsheet, Order } from "../googleApi/types";
import type { GeminiContent } from "../mcp/types";

const facebookApi = new FacebookApiService({
  clientId: process.env.FB_CLIENT_ID as string,
  clientSecret: process.env.FB_CLIENT_SECRET as string
});

const googleApi = new GoogleApiService({
  clientId: process.env.GOOGLE_CLIENT_ID as string,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  redirectUri: process.env.CORS_ORIGIN as string
});

const userService = new UserService();

class BusinessService extends BaseApiClient {
  private readonly app_business_uid = process.env.APP_BUSINESS_UID!
  private readonly app_user_uid = process.env.APP_USER_UID!

  constructor() {
    super();
  };

  async insert(ai_behaviour: number) {
    const result = await db`
      INSERT INTO businesses (ai_behaviour) 
      VALUES (${ai_behaviour})
      RETURNING *;
    `;
    return result[0] as Business;
  };

  async insertFbPage(business_uid: string, token: string, id: string) {
    const result = await db`
      INSERT INTO facebook_pages (business_uid, token, id) 
      VALUES (${business_uid}, ${token}, ${id})
      RETURNING *;
    `;
    return result[0] as BusinessFacebookPage;
  };

  async insertGoogleSheet(business_uid: string, id: string) {
    const result = await db`
      INSERT INTO business_sheet (business_uid, id)
      VALUES (${business_uid}, ${id})
      RETURNING *;
    `;
    return result[0] as Business;
  };

  async insertBusinessUser(business_uid: string, user_uid: string) {
    const result = await db`
      INSERT INTO business_users (business_uid, user_uid)
      VALUES (${business_uid}, ${user_uid})
      RETURNING *;
    `;
    return result[0] as BusinessUser;
  };

  async get(uid: string) {
    const result = await db`SELECT * FROM businesses WHERE uid = ${uid}`;
    return result[0] as Business;
  };

  async getFbPage(id: string) {
    const result = await db`SELECT * FROM facebook_pages WHERE id = ${id} LIMIT 1;`;
    return result[0] as BusinessFacebookPage;
  };

  async getBusinessInfo(user_uid: string, business_uid: string) {
    const result = await db`
      SELECT 
        b.*, 
        bs.id AS google_sheet_id,
        fp.id AS facebook_page_id, 
        fp.token AS facebook_page_token
      FROM businesses b
      JOIN business_users bu ON bu.business_uid = b.uid
      LEFT JOIN facebook_pages fp ON fp.business_uid = b.uid
      LEFT JOIN business_sheet bs ON bs.business_uid = b.uid
      WHERE bu.user_uid = ${user_uid}
        AND bu.business_uid = ${business_uid}
      LIMIT 1;
    `;
    return result[0] as BusinessInfoJoin;
  };

  async getBusinessInfoByFbPage(id: string) {
    const result = await db`
      SELECT 
        b.*, 
        bu.user_uid,
        bgs.id AS google_sheet_id,
        fp.id AS facebook_page_id, 
        fp.token AS facebook_page_token
      FROM businesses b
      JOIN facebook_pages fp ON fp.business_uid = b.uid
      LEFT JOIN business_sheet bgs ON bgs.business_uid = b.uid
      JOIN business_users bu ON bu.business_uid = b.uid
      WHERE fp.id = ${id}
      LIMIT 1;
    `;
    return result[0] as { user_uid: string } & BusinessInfoJoin;
  };

  async getBusinessesInfo(user_uid: string) {
    const result = await db`
      SELECT 
        b.*, 
        bs.id AS google_sheet_id,
        fp.id AS facebook_page_id, 
        fp.token AS facebook_page_token
      FROM businesses b
      JOIN business_users bu ON bu.business_uid = b.uid
      LEFT JOIN facebook_pages fp ON fp.business_uid = b.uid
      LEFT JOIN business_sheet bs ON bs.business_uid = b.uid
      WHERE bu.user_uid = ${user_uid};
    `;
    return result as unknown as BusinessInfoJoin[];
  };

  async getBusinessFbConversation(business_uid: string, senderId: string) {
    const result = await db`
      SELECT * FROM business_facebook_page_conversation
      WHERE business_uid = ${business_uid}
      AND senderId = ${senderId}
      LIMIT 1;
    `;
    return result[0] as { id: string };
  };

  async insertBusinessFbConversation(business_uid: string, conversationId: string, senderId: string) {
    const result = await db`
      INSERT INTO business_facebook_page_conversation (business_uid, id, senderId)
      VALUES (${business_uid}, ${conversationId}, ${senderId})
      RETURNING *;
    `;
    return result[0] as { id: string };
  };

  async update(uid: string, data: BusinessDataUpdate) {
    const result = await db`
      UPDATE businesses SET 
        ai_behaviour = ${data.ai_behaviour},
        ai_system_prompt = ${data.ai_system_prompt},
        status = ${data.status}
      WHERE uid = ${uid}
      RETURNING *;
    `;
    return result[0] as Business;
  };

  async create(user_uid: string, page_id: string, ai_behaviour: number) {
    const existedPage = await this.getFbPage(page_id);
    if (existedPage) throw new Error(`Facebook page with ID "${page_id}" is already linked to business "${existedPage.business_uid}".`);

    const userFacebook = await userService.getFbByUser(user_uid);
    if (!userFacebook) throw new Error("User facebook not found with uid : " + user_uid)

    const page = await facebookApi.getPage(userFacebook.token, page_id, true);
    if (!page) throw new Error("No page access token found with id : " + page_id);
    const subscribed = await facebookApi.subscribeApp(page.access_token, page_id);
    if (!subscribed) throw new Error("Can't subscribe page with id : " + page_id);
    const exchangeToken = await facebookApi.exchangeForLongLivedToken(page.access_token);

    const business = await this.insert(ai_behaviour);
    await this.insertBusinessUser(business.uid, user_uid);
    await this.insertFbPage(business.uid, exchangeToken.access_token, page_id);
    const businessInfo: BusinessInfo = { ...business, facebook: page, google: {} };

    if (ai_behaviour == 1) {
      const googleSheets = await userService.getGoogle(user_uid);
      if (!googleSheets) throw new Error("User does not connected to Google account yet");

      const sheetTitle = process.env.APP_NAME + " - " + page.name;
      const spreadsheet = await googleApi.createSpreadsheet(googleSheets, sheetTitle);

      await this.insertGoogleSheet(business.uid, spreadsheet.spreadsheetId);

      businessInfo.google = { spreadsheet };
    }

    return businessInfo;
  };

  async getBusiness(user_uid: string, business_uid: string, joinData?: BusinessInfoJoin) {
    const join = joinData || await this.getBusinessInfo(user_uid, business_uid);
    if (!join) throw new Error(`Business does not exist.`);
    const facebookPage = await facebookApi.getPage(join.facebook_page_token, join.facebook_page_id);
    const googleData: { spreadsheet?: GoogleSpreadsheet } = {};
    if (join.google_sheet_id) {
      const userGoogle = await userService.getGoogle(user_uid);
      if (!userGoogle) throw new Error("User does not connected to Google account yet");
      const googleSpreadsheet = await googleApi.getSpreadsheet(userGoogle, join.google_sheet_id);
      googleData.spreadsheet = googleSpreadsheet;
    };
    const { ["facebook_page_id"]: removed1, ["facebook_page_token"]: removed2, ["google_sheet_id"]: removed3, ...business } = join;
    const businessInfo: BusinessInfo = { ...business, facebook: facebookPage, google: googleData };
    return businessInfo;
  };

  async getBusinesses(user_uid: string) {
    const joins = await this.getBusinessesInfo(user_uid);
    const businessesInfo = await Promise.all(joins.map(async (join) => this.getBusiness(user_uid, join.uid, join)));
    return businessesInfo;
  };

  async appChatTest(data: ChatTestData) {
    if (data.conversation.length > 100) throw new Error("Conversation is too long (max 100 messages)");
    if (data.message.text.length > 500) throw new Error("Message is too long (max 500 characters)");
    if (!data.message.text) throw new Error("Message is required");

    const conversation: GeminiContent[] = [
      ...data.conversation.map((message) => ({
        role: message.role as GeminiContent["role"],
        parts: [{
          text: message.content.text
        }]
      })),
      {
        role: "user" as GeminiContent["role"],
        parts: [{
          text: data.message.text
        }]
      }
    ];

    const mcpService = new MCPService({ type: "app" }, conversation);
    // await this.updateTokenCount("", 1);
    return await mcpService.callAI();
  };

  async chatTest(user_uid: string, business_uid: string, data: ChatTestData) {
    if (data.conversation.length > 100) throw new Error("Conversation is too long (max 100 messages)");
    if (data.message.text.length > 500) throw new Error("Message is too long (max 500 characters)");
    if (!data.message.text) throw new Error("Message is required");
    if (!data.testAiSystemPrompt) throw new Error("Business information are required");

    const conversation: GeminiContent[] = [
      ...data.conversation.map((message) => ({
        role: message.role as GeminiContent["role"],
        parts: [{
          text: message.content.text
        }]
      })),
      {
        role: "user" as GeminiContent["role"],
        parts: [{
          text: data.message.text
        }]
      }
    ];

    const mcpService = new MCPService({ type: "business", user_uid, business_uid }, conversation, "", data.testAiSystemPrompt);
    const aiResponse = await mcpService.callAI();
    await this.updateTokenCount(business_uid, aiResponse.total_token_count);
    return aiResponse;
  };

  async chat(sender: string, recipient: string) {
    const business = await this.getBusinessInfoByFbPage(recipient);
    let conversation = await this.getBusinessFbConversation(business.uid, sender);
    let conversationId: string;
    if (!conversation) {
      conversationId = await facebookApi.getConversationId(business.facebook_page_token, business.facebook_page_id, sender);
      conversation = await this.insertBusinessFbConversation(business.uid, conversationId, sender);
    }
    const messages = await facebookApi.getConversationMessages(business.facebook_page_token, conversation.id);

    // console.dir({ sender, recipient, message, messages }, { depth: null });

    if (business.status == 0) return;
    else {
      const formattedConversation: GeminiContent[] = messages.map((e) => ({
        role: e.from == sender ? "user" : "model" as GeminiContent["role"],
        parts: [{
          text: e.message.text
        }]
      })).reverse();

      // console.dir({ formattedConversation }, { depth: null });

      const mcpService = new MCPService({ type: "business", user_uid: business.user_uid, business_uid: business.uid }, formattedConversation, conversation.id, business.ai_system_prompt);
      const aiResponse = await mcpService.callAI();
      await this.updateTokenCount(business.uid, aiResponse.total_token_count);
      await facebookApi.sendMessage(business.facebook_page_token, business.facebook_page_id, sender, { text: aiResponse.text } as { text: string });
    }
  };

  // async notifyBusinessUser(user_uid:string, message: { text: string }) {
  //   const app_business = await this.getBusinessInfo(this.app_user_uid, this.app_business_uid);

  //   const app_facebook_page_token = app_business.facebook_page_token;
  //   const app_facebook_page_id = app_business.facebook_page_id;

  //   let recipientId:string;

  //   if(app_business.status == 0) return;
  //   if(user_uid == this.app_user_uid) {
  //     const user = await userService.getFbByUser(this.app_user_uid);
  //     recipientId = user.id;
  //   } else {
  //     const user = await userService.getFbByUser(user_uid);
  //     recipientId = user.id;
  //   };

  //   console.log({ app_facebook_page_token, app_facebook_page_id, recipientId, message });


  //   facebookApi.sendMessage(app_facebook_page_token, app_facebook_page_id, recipientId, message);
  // };

  async updateInfo(user_uid: string, business_uid: string, data: BusinessDataUpdate) {
    const oldBusinessData = await this.getBusinessInfo(user_uid, business_uid);
    if (!oldBusinessData) throw new Error("oldBusinessData not found");
    const unchangedFields = Object.keys(data).every((field: string) => {
      const oldField = oldBusinessData[field as keyof BusinessInfoJoin];
      const newField = data[field as keyof BusinessDataUpdate];
      return [undefined, oldField].includes(newField);
    });
    if (unchangedFields) throw new Error("No data to update");

    if (data.status == 1 && !oldBusinessData.ai_system_prompt) throw new Error("Business information are required");

    if (data.ai_behaviour == 1 && !oldBusinessData.google_sheet_id) {
      const googleSheets = await userService.getGoogle(user_uid);
      if (!googleSheets) throw new Error("User does not connected to Google account yet");
      const facebookPage = await facebookApi.getPage(oldBusinessData.facebook_page_token, oldBusinessData.facebook_page_id);
      const sheetTitle = process.env.APP_NAME + " - " + facebookPage.name;
      const spreadsheet = await googleApi.createSpreadsheet(googleSheets, sheetTitle);

      await this.insertGoogleSheet(business_uid, spreadsheet.spreadsheetId);
    }

    const updatedBusiness = { ...oldBusinessData, ...data };
    await this.update(business_uid, updatedBusiness);
    const newBusinessData = await this.getBusiness(user_uid, business_uid);
    // if (oldBusinessData.status != newBusinessData.status) await this.notifyBusinessUser(user_uid, { text: "Business status updated successfully to " + (newBusinessData.status == 1 ? "Live 🟢" : "Testing 🟡") });
    return newBusinessData;
  };

  async getProducts(user_uid: string, business_uid: string) {
    const business = await this.getBusinessInfo(user_uid, business_uid);
    if (!business.google_sheet_id) throw new Error("Business does not have a Google sheet");
    const userGoogle = await userService.getGoogle(user_uid);
    if (!userGoogle) throw new Error("User does not connected to Google account yet");
    const products = await googleApi.getSheetProducts(userGoogle, business.google_sheet_id);
    return googleApi.formatSheetsData(products);
  };

  async getOrders(user_uid: string, business_uid: string) {
    const business = await this.getBusinessInfo(user_uid, business_uid);
    if (!business.google_sheet_id) throw new Error("Business does not have a Google sheet");
    const userGoogle = await userService.getGoogle(user_uid);
    if (!userGoogle) throw new Error("User does not connected to Google account yet");
    const orders = await googleApi.getSheetOrders(userGoogle, business.google_sheet_id);
    return googleApi.formatSheetsData(orders);
  };

  async updateTokenCount(business_uid: string, tokenCount: number) {
    const business = await db`
      UPDATE businesses
      SET ai_tokens_count = ai_tokens_count + ${tokenCount}
      WHERE uid = ${business_uid}
      RETURNING *;
    `;

    return business[0] as Business;
  };

  async placeOrder(user_uid: string, business_uid: string, order: Order & { conversation: string }) {
    const business = await this.getBusinessInfo(user_uid, business_uid);
    if (!business.google_sheet_id) throw new Error("Business does not have a Google sheet");
    const userGoogle = await userService.getGoogle(user_uid);
    if (!userGoogle) throw new Error("User does not connected to Google account yet");
    console.dir({ order }, { depth: null });
    return await googleApi.addOrderToSheet(userGoogle, business.google_sheet_id, order);
  };

};

export default BusinessService;

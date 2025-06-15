import db from "../../database";
import UserService from "../user";
import GoogleApiService from "../googleApi";
import FacebookApiService from "../facebookApi";
import BaseApiClient from "../../plugins/baseApiClient";
import type { Business, BusinessUser, BusinessInfo, BusinessFacebookPage, BusinessInfoJoin, BusinessDataUpdate, ChatTestData } from "./types";
import type { GoogleSpreadsheet } from "../googleApi/types";

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
  constructor() {
    super();
  };

  async insert(ai_behaviour: number) {
    const result = await db`
      INSERT INTO businesses (ai_behaviour) 
      VALUES (${ ai_behaviour })
      RETURNING *;
    `;
    return result[ 0 ] as Business;
  };

  async insertFbPage(business_uid: string, token: string, id: string) {
    const result = await db`
      INSERT INTO facebook_pages (business_uid, token, id) 
      VALUES (${ business_uid }, ${ token }, ${ id })
      RETURNING *;
    `;
    return result[ 0 ] as BusinessFacebookPage;
  };

  async insertGoogleSheet(business_uid: string, id: string) {
    const result = await db`
      INSERT INTO business_sheet (business_uid, id)
      VALUES (${ business_uid }, ${ id })
      RETURNING *;
    `;
    return result[ 0 ] as Business;
  };

  async insertBusinessUser(business_uid: string, user_uid: string) {
    const result = await db`
      INSERT INTO business_users (business_uid, user_uid)
      VALUES (${ business_uid }, ${ user_uid })
      RETURNING *;
    `;
    return result[ 0 ] as BusinessUser;
  };

  async get(uid: string) {
    const result = await db`SELECT * FROM businesses WHERE uid = ${ uid }`;
    return result[ 0 ] as Business;
  };

  async getFbPage(id: string) {
    const result = await db`SELECT * FROM facebook_pages WHERE id = ${ id } LIMIT 1;`;
    return result[ 0 ] as BusinessFacebookPage;
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
      WHERE bu.user_uid = ${ user_uid }
        AND bu.business_uid = ${ business_uid }
      LIMIT 1;
    `;
    return result[ 0 ] as BusinessInfoJoin;
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
      WHERE fp.id = ${ id }
      LIMIT 1;
    `;
    return result[ 0 ] as { user_uid: string } & BusinessInfoJoin;
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
      WHERE bu.user_uid = ${ user_uid };
    `;
    return result as unknown as BusinessInfoJoin[];
  };

  async getBusinessFbConversation(business_uid: string, senderId: string) {
    const result = await db`
      SELECT * FROM business_facebook_page_conversation
      WHERE business_uid = ${ business_uid }
      AND senderId = ${ senderId }
      LIMIT 1;
    `;
    return result[ 0 ] as { id: string };
  };

  async insertBusinessFbConversation(business_uid: string, conversationId: string, senderId: string) {
    const result = await db`
      INSERT INTO business_facebook_page_conversation (business_uid, id, senderId)
      VALUES (${ business_uid }, ${ conversationId }, ${ senderId })
      RETURNING *;
    `;
    return result[ 0 ] as { id: string };
  };

  async update(uid: string, data: BusinessDataUpdate) {
    const result = await db`
      UPDATE businesses SET 
        ai_behaviour = ${ data.ai_behaviour },
        ai_system_prompt = ${ data.ai_system_prompt },
        status = ${ data.status }
      WHERE uid = ${ uid }
      RETURNING *;
    `;
    return result[ 0 ] as Business;
  };
  
  async create(user_uid: string, page_id: string, ai_behaviour: number) {
    const existedPage = await this.getFbPage(page_id);
    if (existedPage) throw new Error(`Facebook page with ID "${ page_id }" is already linked to business "${ existedPage.business_uid }".`);

    const userFacebook = await userService.getFbByUser(user_uid);
    if(!userFacebook) throw new Error("User facebook not found with uid : " + user_uid)

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

  async getBusiness(user_uid:string, business_uid: string, joinData?: BusinessInfoJoin) {
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
    const { [ "facebook_page_id" ]: removed1, [ "facebook_page_token" ]: removed2, [ "google_sheet_id" ]: removed3, ...business } = join;
    const businessInfo: BusinessInfo = { ...business, facebook: facebookPage, google: googleData };
    return businessInfo;
  };

  async getBusinesses(user_uid:string) {
    const joins = await this.getBusinessesInfo(user_uid);
    const businessesInfo = await Promise.all(joins.map(async (join) => this.getBusiness(user_uid, join.uid, join)));
    return businessesInfo;
  };

  async appChatTest(data: ChatTestData) {
    if(data.conversation.length > 100) throw new Error("Conversation is too long (max 100 messages)");
    if(data.message.text.length > 500) throw new Error("Message is too long (max 500 characters)");
    if(!data.message.text) throw new Error("Message is required");
    data.testAiSystemPrompt = process.env.APP_INFORMATION as string;
    return await this.makeRequest(process.env.AI_HOST as string, {
      method: "POST",
      body: JSON.stringify(data)
    });
  };

  async chatTest(user_uid:string, business_uid: string, data: ChatTestData) {
    if(data.conversation.length > 100) throw new Error("Conversation is too long (max 100 messages)");
    if(data.message.text.length > 500) throw new Error("Message is too long (max 500 characters)");
    if(!data.message.text) throw new Error("Message is required");
    if(!data.testAiSystemPrompt) throw new Error("Business information are required");
    return await this.makeRequest(process.env.AI_HOST as string, {
      method: "POST",
      body: JSON.stringify(data)
    });
  };

  async chat(sender:string, recipient: string, message: { text?: string }) {
    const business = await this.getBusinessInfoByFbPage(recipient);
    let conversation = await this.getBusinessFbConversation(business.uid, sender);
    if (!conversation) {
      const conversationId = await facebookApi.getConversationId(business.facebook_page_token, business.facebook_page_id, sender);
      conversation = await this.insertBusinessFbConversation(business.uid, conversationId, sender);
    }
    const messages = await facebookApi.getConversationMessages(business.facebook_page_token, conversation.id);
    if(business.status == 1) {
      const aiResponse = await this.makeRequest(process.env.AI_HOST as string, {
        method: "POST",
        body: JSON.stringify({
          sender,
          recipient,
          message,
          business,
          conversation: messages,
          products: await this.getProducts(business.user_uid, business.uid),
          orders: await this.getOrders(business.user_uid, business.uid),
        })
      });
      await facebookApi.sendMessage(business.facebook_page_token, business.facebook_page_id, sender, aiResponse as { text: string });
    }
  };

  async updateInfo(user_uid:string, business_uid: string, data: BusinessDataUpdate) {
    const oldBusinessData = await this.getBusinessInfo(user_uid, business_uid);
    if (!oldBusinessData) throw new Error("oldBusinessData not found");
    const unchangedFields = Object.keys(data).every((field: string) => {
      const oldField = oldBusinessData[ field as keyof BusinessInfoJoin ];
      const newField = data[ field as keyof BusinessDataUpdate ];
      return [ undefined, oldField ].includes(newField);
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
};

export default BusinessService;
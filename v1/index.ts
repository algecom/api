import { Elysia } from "elysia";

import UserService from "./services/user";
import BusinessService from "./services/business";
import responseMiddleware from "./middleware/response";
import { authMiddleware, refreshAuthJwtCookie, destroyAuthJwtCookie } from "./middleware/auth";
import type { AuthJwtValue } from "./middleware/auth/types";
import type { BusinessDataUpdate, ChatTestData } from "./services/business/types";

const userService = new UserService();
const businessService = new BusinessService();

const server = (app: Elysia) => {
  app.use(authMiddleware);
  app.use(responseMiddleware);

  app.get("/facebook/webhook", async ({ query }) => {
    const validation = query["hub.mode"] === 'subscribe' && query["hub.verify_token"] === process.env.FB_VERIFY_WEBHOOK_TOKEN && query["hub.challenge"];
    console.log(validation ? "Webhook validated successfully ✅" : "Webhook validation failed ❌");
    return validation;
  });
  
  app.post("/login/facebook", async context => {
    const user = await userService.loginWithFacebook(context.query.token as string);
    const authJwtValue: AuthJwtValue= {
      uid: user.uid,
      keepToken: true,
      platform: "facebook",
      token: user.token.value,
      expires_at: user.token.expires_at
    };
    await refreshAuthJwtCookie(context, authJwtValue);
    const facebookUser = { uid: user.uid, facebook: user.facebook }; // remove token from LoggedFacebookUser
    return facebookUser;
  });

  app.post("/logout", destroyAuthJwtCookie);
  
  app.get("/user", async ({ store }) => {
    const { user } = store as { user: AuthJwtValue };
    const google =  await userService.getGoogleUser(user.uid);
    
    switch (user.platform) {
      case "facebook":
        const facebookUser = await userService.getFacebookUser(user.uid);
        return { uid: user.uid, facebook: facebookUser, google };
    
      default:
        const data = await userService.get(user.uid);
        return { ...data, google };
    }
  });
  
  app.get("/user/facebook/pages", async ({ query, store }) => {
    const { user } = store as { user: AuthJwtValue };
    const pages = await userService.getFacebookUserPages(user.uid, query.id);
    return pages;
  });
  
  app.post("/user/connect/google/sheets", async ({ body, store }) => {
    const { user } = store as { user: AuthJwtValue };
    const { code } = body as { code: string };    
    const googleUser = await userService.connectToGoogleSheets(user.uid, code);    
    return googleUser;
  });

  app.get("/businesses", async ({ store }) => {
    const { user } = store as { user: AuthJwtValue };
    const businesses = await businessService.getBusinesses(user.uid);    
    return businesses;
  });

  app.post("/business/create", async ({ body, store }) => {
    const { user } = store as { user: AuthJwtValue };
    const { page_id, ai_behaviour } = body as { page_id: string, ai_behaviour: number };
    const business = await businessService.create(user.uid, page_id, ai_behaviour);    
    return business;
  });

  app.get("/business/:uid", async ({ params, store }) => {
    const { user } = store as { user: AuthJwtValue };
    const { uid } = params as { uid: string };
    const business = await businessService.getBusiness(user.uid, uid);    
    return business;
  });

  app.post("/chat/test", async ({ body }) => {
    const data = body as ChatTestData;
    const response = await businessService.appChatTest(data);
    return response;
  });

  app.post("/business/:uid/chat/test", async ({ params, store, body }) => {
    const { user } = store as { user: AuthJwtValue };
    const { uid } = params as { uid: string };
    const data = body as ChatTestData;
    const response = await businessService.chatTest(user.uid, uid, data);
    console.dir({ response }, { depth: null });
    return response;
  });

  app.post("/business/:uid/update", async ({ params, store, body }) => {
    const { user } = store as { user: AuthJwtValue };
    const { uid } = params as { uid: string };
    const data = body as BusinessDataUpdate;
    const response = await businessService.updateInfo(user.uid, uid, data);
    return response;
  });
  
  app.get("/business/:uid/products", async ({ params, store }) => {
    const { user } = store as { user: AuthJwtValue };
    const { uid } = params as { uid: string };
    const products = await businessService.getProducts(user.uid, uid);    
    return products;
  });

  app.get("/business/:uid/orders", async ({ params, store }) => {
    const { user } = store as { user: AuthJwtValue };
    const { uid } = params as { uid: string };
    const orders = await businessService.getOrders(user.uid, uid);    
    return orders;
  });

  app.post("/facebook/webhook", async ({ body }) => {
    const { entry } = body as any;
    const { sender, recipient, message } = entry?.[0]?.messaging?.[0];

    const response = await businessService.chat(sender.id, recipient.id, message);
    
    // const { mode, token, challenge, verify_token } = body as { mode: string, token: string, challenge: string, verify_token: string };
    // const response = await facebookApi.validateWebhook(mode, token, challenge, verify_token);
    // return response;
    
    return;
  });

  // cron jobs will call these endpoints to refresh tokens every 1 day
  app.get("/cronjob/refresh/facebook/tokens", async () => {
    const facebook_users = await userService.refreshFacebookTokens();
    const facebook_pages = await businessService.refreshFacebookTokens();
    return { facebook_users, facebook_pages };
  });

  // cron jobs will call these endpoints to refresh tokens every 20 minutes
  app.get("/cronjob/refresh/google/tokens", async () => {
    return await userService.refreshGoogleTokens();
  });
  
  return app;
};

export default server;
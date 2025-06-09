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
    const { 
      ["hub.mode"]: mode, ["hub.challenge"]: challenge, ["hub.verify_token"]: verify_token 
    } = query as { 
      ["hub.mode"]: string, ["hub.challenge"]: string, ["hub.verify_token"]: string 
    };
    const validation = (mode === 'subscribe' && verify_token === process.env.FB_VERIFY_WEBHOOK_TOKEN) ? challenge : null;
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

  app.post("/facebook/webhook", async ({ body, query }) => {
    console.dir({ body, query }, { depth: null });
    // const { mode, token, challenge, verify_token } = body as { mode: string, token: string, challenge: string, verify_token: string };
    // const response = await facebookApi.validateWebhook(mode, token, challenge, verify_token);
    // return response;
    return;
  });

  return app;
};

export default server;
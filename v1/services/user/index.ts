import db from "../../database";
import GoogleApi from "../googleApi";
import FacebookApiService from "../facebookApi";
import type { GoogleUser } from "../googleApi/types";
import type { OAuthTokens } from "../../types";
import type { User, UserFacebook, LoggedWithFacebook, UserGoogle } from "./types";

const facebookApi = new FacebookApiService({
  clientId: process.env.FB_CLIENT_ID as string,
  clientSecret: process.env.FB_CLIENT_SECRET as string
});

const googleApi = new GoogleApi({
  clientId: process.env.GOOGLE_CLIENT_ID as string,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  redirectUri: ((e = process.env.CORS_ORIGIN) => e?.split(",").find(e => e.includes("app.")) || e) as any
});

class UserService {
  constructor() {};

  async insert() {
    const result = await db`
      INSERT INTO users (uid, created_at, updated_at) 
      VALUES (DEFAULT, DEFAULT, DEFAULT)
      RETURNING *;
    `;
    return result[ 0 ] as User;
  };

  async insertFb({ user_uid, token, id }: UserFacebook) {
    const result = await db`
      INSERT INTO facebook_users (user_uid, token, id) 
      VALUES (${user_uid}, ${token}, ${id})
      RETURNING *;
    `;
    return result[ 0 ] as UserFacebook;
  };

  async insertGoogleSheets(user_uid: string, { access_token, refresh_token }: OAuthTokens) {
    const result = await db`
      INSERT INTO google_sheets (user_uid, token, refresh_token)
      VALUES (${user_uid}, ${access_token}, ${refresh_token as string})
      ON CONFLICT (user_uid)
      DO UPDATE SET token = EXCLUDED.token, refresh_token = EXCLUDED.refresh_token
      RETURNING *;
    `;
    return result[ 0 ] as UserGoogle;
  };

  async get(uid: string) {
    const result = await db`SELECT * FROM users WHERE uid = ${ uid }`;
    return result[ 0 ] as User;
  };

  async getFb(id: string) {
    const result = await db`SELECT * FROM facebook_users WHERE id = ${ id } LIMIT 1;`;
    return result[ 0 ] as UserFacebook;
  };

  async getFbByUser(user_uid: string) {
    const result = await db`SELECT * FROM facebook_users WHERE user_uid = ${ user_uid } LIMIT 1;`;
    return result[ 0 ] as UserFacebook;
  };

  async getGoogle(uid: string) {
    const result = await db`SELECT * FROM google_sheets WHERE user_uid = ${ uid }`;
    return result[ 0 ] as UserGoogle;
  };

  async updateFbToken(uid: string, token: string) {
    const result = await db`
      UPDATE facebook_users
      SET token = ${ token }
      WHERE user_uid = ${ uid }
      RETURNING *;
    `;
    return result[ 0 ] as UserFacebook;
  };

  async updateGoogleToken(token: string, refresh_token: string) {
    const result = await db`
      UPDATE google_sheets
      SET token = ${ token }
      WHERE refresh_token = ${ refresh_token }
      RETURNING *;
    `;
    return result[ 0 ] as UserGoogle;
  };

  async loginWithFacebook(token: string): Promise<LoggedWithFacebook> {
    const userFromFb = await facebookApi.getUser(token);
    const newToken = await facebookApi.exchangeAndVerifyToken(token);

    const fbUser = await this.getFb(userFromFb.id);

    const loggedUser: LoggedWithFacebook = {
      uid: fbUser?.user_uid,
      token: newToken,
      facebook: userFromFb,
    };

    if (!fbUser?.user_uid) { // If the user does not exist, create it.
      const newUser = await this.insert();
      const newFbUser = await this.insertFb({ user_uid: newUser.uid, token: newToken.value, id: userFromFb.id });
      loggedUser.uid = newFbUser.user_uid;
    }
    else await this.updateFbToken(fbUser.user_uid, newToken.value);

    return loggedUser;
  };

  async getFacebookUser(uid: string) {
    const users: UserFacebook[] = await db`SELECT * FROM facebook_users WHERE user_uid = ${ uid };`;
    const user = users[ 0 ] as UserFacebook;
    return await facebookApi.getUser(user.token as string);
  };

  async getFacebookUserPages(uid: string, id?: string) {
    const users: UserFacebook[] = await db`SELECT * FROM facebook_users WHERE user_uid = ${ uid };`;
    const user = users[ 0 ] as UserFacebook;
    if (id) return await facebookApi.getPage(user.token, id);
    else return await facebookApi.getPages(user.token);
  };

  async connectToGoogleSheets(user_uid: string, code: string): Promise<GoogleUser> {
    if(!code) throw new Error("Unable to connect to Google. Missing credentials.");
    const tokens = await googleApi.exchangeCodeForTokens(code);
    const googleSheets = await this.insertGoogleSheets(user_uid, tokens);
    const userFromGoogle = await googleApi.getUserInfo(googleSheets);

    return userFromGoogle;
  };

  async getGoogleUser(uid: string) {
    const user = await this.getGoogle(uid);
    if(user) {
      const userGoogle = await googleApi.getUserInfo(user);
      return userGoogle;
    }
    return undefined;
  };
};

export default UserService;

import db from "../../database";
import GoogleApi from "../googleApi";
import FacebookApiService from "../facebookApi";
import type { GoogleUser } from "../googleApi/types";
import type { NewToken, OAuthTokens } from "../../types";
import type { User, UserFacebook, LoggedWithFacebook, UserGoogle } from "./types";

const facebookApi = new FacebookApiService({
  clientId: process.env.FB_CLIENT_ID as string,
  clientSecret: process.env.FB_CLIENT_SECRET as string
});

const googleApi = new GoogleApi({
  clientId: process.env.GOOGLE_CLIENT_ID as string,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  redirectUri: ((e = process.env.CORS_ORIGIN) => e?.split(",").find(e => e.includes("app.")) || e)() as string
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

  async insertFb({ user_uid, token, id, expires_at }: UserFacebook & { expires_at: number }) {
    const result = await db`
      INSERT INTO facebook_users (user_uid, token, id, expires_at) 
      VALUES (${user_uid}, ${token}, ${id}, ${new Date(expires_at * 1000).toJSON()})
      RETURNING *;
    `;
    return result[ 0 ] as UserFacebook;
  };

  async insertGoogleSheets(user_uid: string, { access_token, refresh_token, expires_in }: OAuthTokens) {
    const result = await db`
      INSERT INTO google_sheets (user_uid, token, refresh_token, expires_at)
      VALUES (${user_uid}, ${access_token}, ${refresh_token as string}, ${new Date(Date.now() + (expires_in as number * 1000)).toJSON()})
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

  async updateFbToken(uid: string, token: NewToken) {
    const result = await db`
      UPDATE facebook_users
      SET token = ${ token.value }, expires_at = ${ new Date(token.expires_at * 1000).toJSON() }
      WHERE id = ${ uid }
      RETURNING *;
    `;
    return result[ 0 ] as UserFacebook;
  };

  async updateGoogleToken(token: NewToken, refresh_token: string) {
    const result = await db`
      UPDATE google_sheets
      SET token = ${ token.value }, expires_at = ${ Date.now() + token.expires_at }
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

    if (!fbUser?.user_uid) {
      const newUser = await this.insert();
      const newFbUser = await this.insertFb({ user_uid: newUser.uid, token: newToken.value, id: userFromFb.id, expires_at: newToken.expires_at });
      loggedUser.uid = newFbUser.user_uid;
    }
    else await this.updateFbToken(fbUser.id, newToken);

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

  async refreshFacebookTokens() {
    const tenDaysS: number = 10 * 24 * 60 * 60 * 1000; // 10 days in milliseconds
    const users: UserFacebook[] = await db`
      SELECT * 
      FROM facebook_users 
      WHERE expires_at < ${ new Date(Date.now() + tenDaysS).toJSON() };
    `;

    const response = {
      table: "facebook_users",
      total: users.length,
      updated: [] as string[],
      failed: [] as string[],
      percentage: 0,
    };

    for (const user of users) {
      const newToken = await facebookApi.exchangeAndVerifyToken(user.token as string);
      const updatedUser = await this.updateFbToken(user.user_uid, newToken);
      if(updatedUser) response.updated.push(user.user_uid);
      else response.failed.push(user.user_uid);
    }

    response.percentage = response.updated.length / response.total * 100;
    return response;
  };

  async refreshGoogleTokens() {
    const tenMinutesS: number = 10 * 60 * 1000; // 10 minutes in milliseconds
    const users: UserGoogle[] = await db`
      SELECT * 
      FROM google_sheets 
      WHERE expires_at < ${ new Date(Date.now() + tenMinutesS).toJSON() };
    `;

    const response = {
      table: "google_sheets",
      total: users.length,
      updated: [] as string[],
      failed: [] as string[],
      percentage: 0,
    };

    for (const user of users) {
      const newToken = await googleApi.refreshAccessToken(user.refresh_token as string);
      if(newToken) response.updated.push(user.user_uid);
      else response.failed.push(user.user_uid);
    }

    response.percentage = response.updated.length / response.total * 100;
    return response;
  };
};

export default UserService;

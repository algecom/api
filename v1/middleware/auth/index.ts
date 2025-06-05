import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import type { Context, CookieOptions } from "elysia";
import type { NewToken } from "../../types";
import type { AuthJwtValue } from "./types";
import FacebookApiService from "../../services/facebookApi";

const facebookApi = new FacebookApiService({
  clientId: process.env.FB_CLIENT_ID as string,
  clientSecret: process.env.FB_CLIENT_SECRET as string
});

const tenDaysS: number = 10 * 24 * 60 * 60; // 10 days in seconds
const publicRoutes: string[] = [ "", "/login/*", "/chat/test" ]; // without /v1/

const cookieConfig: CookieOptions = {
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "none",
};

const authJwt = jwt({ secret: process.env.JWT_SECRET as string }).decorator.jwt;

const checkAuthHandler = async (context: Context) => {
  if (!context.cookie.authToken?.value) return false;
  return await authJwt.verify(context.cookie.authToken?.value) as unknown as AuthJwtValue;
};

const unauthorizedHandler = (context: Context) => {
  context.set.status = 401;
  return { error: "Unauthorized", message: "Authentication required for this endpoint" };
};

const refreshAuthJwtCookie = async (context: Context, authJwtValue: AuthJwtValue) => {
  let newToken: NewToken = { value: authJwtValue.token, expires_at: authJwtValue.expires_at };
  
  if (!authJwtValue.keepToken) {
    switch (authJwtValue.platform) {
      case "facebook":
        newToken = await facebookApi.exchangeAndVerifyToken(authJwtValue.token as string);
        break;
    
      default: authJwtValue.platform = "email";
        break;
    }
  }

  const jwtValue: AuthJwtValue = { 
    uid: authJwtValue.uid,
    token: newToken.value,
    expires_at: newToken.expires_at,
    platform: authJwtValue.platform
  };

  const token = await authJwt.sign(jwtValue as any);
  context.cookie.authToken?.set({ ...cookieConfig, value: token, maxAge: jwtValue.expires_at });
  context.store = { user: { ...authJwtValue, token: jwtValue.token, expires_at: jwtValue.expires_at } };
};

const destroyAuthJwtCookie = (context: Context) => {
  context.cookie.authToken?.set({ ...cookieConfig, value: "", maxAge: 0 });
  context.set.status = 200;
};

// Add this right before your authMiddleware
const debugMiddleware = (app: Elysia) => app.onRequest(({ request }) => {
  console.log("\n===== REQUEST DEBUG =====");
  console.log("Method:", request.method);
  console.log("Endpoint:", newURL(request?.url)?.pathname);
  console.log("Origin header:", request.headers.get("origin"));
  console.log("Time:", new Date().toLocaleString());
  console.log("=========================\n");
});

// CORS/Auth middleware
const authMiddleware = (app: Elysia) => app.use(debugMiddleware).onBeforeHandle(async context => {
  const isPublicRoute = publicRoutes.some(route => {
    route = "/v1" + route;    
    if (route.endsWith("*")) {
      const routePrefix = route.slice(0, -1);
      return context.path.startsWith(routePrefix);
    }
    return route === context.path;
  });

  if (isPublicRoute) return;

  const user = await checkAuthHandler(context) as unknown as false | AuthJwtValue;
  if (!user) return unauthorizedHandler(context);

  if (user.expires_at - (Date.now() / 1000) > tenDaysS) context.store = { user };
  else await refreshAuthJwtCookie(context, user);
});

export { authJwt, authMiddleware, refreshAuthJwtCookie, destroyAuthJwtCookie };

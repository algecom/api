import type { NewToken } from "../../types";
import type { FacebookUser } from "../facebookApi/types";

interface User {
  uid: string;
  created_at: Date;
  updated_at: Date;
};

interface UserFacebook {
  user_uid: string;
  token: string;
  id: string;
};

interface LoggedWithFacebook {
  uid: string;
  token: NewToken;
  platform?: "facebook";
  facebook: FacebookUser;
};

interface UserGoogle {
  user_uid: string;
  token: string;
  refresh_token: string;
};

export type { User, UserFacebook, LoggedWithFacebook, UserGoogle };
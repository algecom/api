import type { FacebookApiConfig, FacebookUser, FacebookPage, TokenInfo } from "./types";
import type { NewToken, OAuthTokens } from "../../types";
import BaseApiClient from "../../plugins/baseApiClient";

class FacebookApiService extends BaseApiClient {
  private readonly config: FacebookApiConfig;
  private readonly baseUrl = 'https://graph.facebook.com';
  private readonly apiVersion: string;

  private readonly fieldSets = {
    user: 'id,name,email,picture',
    pageMinimal: 'id,name,category,fan_count,picture',
    page: 'id,name,about,category,category_list,fan_count,followers_count,link,picture,cover,website,location,phone,emails,whatsapp_number,is_published,verification_status,description,mission,general_info,products,username',
  };

  constructor(config: FacebookApiConfig) {
    super();
    this.validateConfig(config);
    this.config = { ...config };
    this.apiVersion = config.apiVersion || 'v22.0';
  }

  private validateConfig(config: FacebookApiConfig): void {
    const required = ['clientId', 'clientSecret'];
    const missing = required.filter(key => !config[key as keyof FacebookApiConfig]);
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  private getAppAccessToken(): string {
    return `${this.config.clientId}|${this.config.clientSecret}`;
  }

  private buildApiUrl(endpoint: string, params: Record<string, string> = {}): string {
    const baseUrl = `${this.baseUrl}/${this.apiVersion}/${endpoint}`;
    return this.buildUrlWithParams(baseUrl, params);
  }

  // ============= TOKEN OPERATIONS =============
  async verifyToken(userAccessToken: string): Promise<TokenInfo> {
    const url = this.buildApiUrl('debug_token', {
      input_token: userAccessToken,
      access_token: this.getAppAccessToken(),
    });
    const response = await this.makeRequest<{ data: TokenInfo }>(url);
    return response.data;
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<OAuthTokens> {
    const url = this.buildApiUrl('oauth/access_token');
    return await this.makeRequest<OAuthTokens>(url, {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'fb_exchange_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        fb_exchange_token: shortLivedToken,
      }),
    });
  }

  async exchangeAndVerifyToken(shortLivedToken: string): Promise<NewToken> {
    const exchangeResult = await this.exchangeForLongLivedToken(shortLivedToken);
    const verifyResult = await this.verifyToken(exchangeResult.access_token);

    return {
      value: exchangeResult.access_token,
      expires_at: verifyResult.data_access_expires_at,
    };
  }

  // ============= USER OPERATIONS =============
  async getUser(accessToken: string, fields?: string): Promise<FacebookUser> {
    const url = this.buildApiUrl('me', {
      fields: fields || this.fieldSets.user,
      access_token: accessToken,
    });

    const response = await this.makeRequest<any>(url);

    return {
      id: response.id,
      name: response.name,
      email: response.email || '',
      picture: response.picture?.data?.url || '',
    };
  }

  async getPages(accessToken: string): Promise<FacebookPage[]> {
    const url = this.buildApiUrl('me/accounts', {
      fields: this.fieldSets.page,
      access_token: accessToken,
    });

    const response = await this.makeRequest<{ data: FacebookPage[] }>(url);
    return response.data || [];
  }

  async getPage(accessToken: string, pageId: string, getToken: boolean = false): Promise<FacebookPage> {
    const url = this.buildApiUrl(pageId, {
      fields: this.fieldSets.page + ( getToken ? ",access_token" : "" ),
      access_token: accessToken,
    });

    const response = await this.makeRequest<FacebookPage>(url);
    return response;
  }

  // ============= PAGE INSIGHTS OPERATIONS =============
  async getPageInsights(
    accessToken: string, 
    pageId: string, 
    metrics: string[] = ['page_fans', 'page_impressions', 'page_engaged_users'],
    period: 'day' | 'week' | 'days_28' = 'day',
    since?: string,
    until?: string
  ): Promise<any[]> {
    const params: Record<string, string> = {
      metric: metrics.join(','),
      period,
      access_token: accessToken,
    };

    if (since) params.since = since;
    if (until) params.until = until;

    const url = this.buildApiUrl(`${pageId}/insights`, params);
    const response = await this.makeRequest<{ data: any[] }>(url);
    return response.data || [];
  }

  async sendMessage(accessToken: string, pageId: string, recipientId: string, message: { text: string }): Promise<any> {
    const url = this.buildApiUrl(`${pageId}/messages`, {
      access_token: accessToken,
    });

    return await this.makeRequest<any>(url, {
      method: 'POST',
      body: JSON.stringify({
        recipient: {
          id: recipientId,
        },
        message,
      }),
    });
  }

  async getConversationId(accessToken: string, pageId: string, senderId: string): Promise<any> {
    const url = this.buildApiUrl(`${pageId}/messages`, {
      access_token: accessToken,
    });

    const response = await this.makeRequest<{ data: any[] }>(url);
    console.dir({ getConversation: response }, { depth: null });
    
    return response.data.find((message: any) => message.sender.id == senderId) || null;
  }

  async getConversationMessages(accessToken: string, conversationId: string): Promise<any[]> {
    const url = this.buildApiUrl(`${conversationId}/messages`, {
      access_token: accessToken,
    });

    const response = await this.makeRequest<{ data: any[] }>(url);
    console.dir({ getConversationMessages: response }, { depth: null });
    
    return response.data || [];
  }

  // ============= UTILITY METHODS =============
  getAuthUrl(redirectUri: string, scopes: string[] = ['email', 'pages_show_list']): string {
    return this.buildUrlWithParams('https://www.facebook.com/v22.0/dialog/oauth', {
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(','),
      response_type: 'code',
      state: Math.random().toString(36).substring(7),
    });
  }

  async subscribeApp(accessToken: string, pageId: string): Promise<boolean> {
    const url = this.buildApiUrl(`${pageId}/subscribed_apps`, {
      access_token: accessToken,
    });

    const response = await this.makeRequest<{ data: any[] }>(url);
    
    return !!response.data.find(app => app.id == process.env.FB_CLIENT_ID);
  }

  // ============= BATCH OPERATIONS =============
  async batchRequest(requests: Array<{
    method: 'GET' | 'POST' | 'DELETE';
    relative_url: string;
    body?: string;
  }>, accessToken: string): Promise<any[]> {
    const url = this.buildApiUrl('', { access_token: accessToken });

    return await this.makeRequest<any[]>(url, {
      method: 'POST',
      body: JSON.stringify({ batch: requests }),
    });
  }
}

export default FacebookApiService;
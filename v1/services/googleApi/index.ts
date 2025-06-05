import UserService from "../user";
import BaseApiClient from "../../plugins/baseApiClient";

import type { OAuthTokens } from "../../types";
import type { UserGoogle } from "../user/types";
import type { GoogleSheetManagerConfig, GoogleUser, Product, Order, GoogleSpreadsheet } from "./types";

class GoogleApi extends BaseApiClient {
  private readonly config: GoogleSheetManagerConfig;
  private readonly baseUrl = 'https://sheets.googleapis.com/v4';
  private readonly oauthUrl = 'https://oauth2.googleapis.com';

  constructor(config: GoogleSheetManagerConfig) {
    super();
    this.validateConfig(config);
    this.config = { ...config };
  }

  private validateConfig(config: GoogleSheetManagerConfig): void {
    const required = ['clientId', 'clientSecret', 'redirectUri'];
    const missing = required.filter(key => !config[key as keyof GoogleSheetManagerConfig]);
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  private async invalidTokenErrorHandler(
    error: any,
    refresh_token: string,
    callBack: (newToken: string) => Promise<any>
  ) {
    // Try to detect invalid_token from error message
    const message = error instanceof Error ? error.message : String(error);
    const isInvalidToken =
      message.includes('invalid_token') ||
      message.includes('Invalid Credentials') ||
      message.includes('401');

    console.log({ isInvalidToken });
      
    if (isInvalidToken) {
      if (!refresh_token) throw new Error('No refresh token available');
      const newToken = await this.refreshAccessToken(refresh_token);
      return await callBack(newToken);
    }
    throw error;
  };

  // ============= AUTHENTICATION =============
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    return await this.makeRequest<OAuthTokens>(`${this.oauthUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: this.createFormData({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const userService = new UserService();
    const response = await this.makeRequest<OAuthTokens>(`${this.oauthUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: this.createFormData({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    await userService.updateGoogleToken(response.access_token, refreshToken);
    return response.access_token;
  }

  async getUserInfo(userGoogle: UserGoogle): Promise<GoogleUser> {
    try {
      const user = await this.makeRequest<GoogleUser>('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${userGoogle.token}` },
      });
      return user;
    } catch (error: any) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.getUserInfo({ ...userGoogle, token: newToken })
      ) as GoogleUser;
    }
  }

  // ============= SPREADSHEET OPERATIONS =============
  async createSpreadsheet(userGoogle: UserGoogle, title: string): Promise<GoogleSpreadsheet> {
    try {
      const response = await this.makeRequest<any>(`${this.baseUrl}/spreadsheets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userGoogle.token}` },
        body: JSON.stringify({
          properties: { title },
          sheets: [
            { properties: { title: 'Products' } },
            { properties: { title: 'Orders' } },
          ],
        }),
      });
      

      await this.initializeSpreadsheetHeaders(userGoogle, response.spreadsheetId);

      return response;
    } catch (error: any) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.createSpreadsheet({ ...userGoogle, token: newToken }, title)
      );
    }
  }

  private async initializeSpreadsheetHeaders(userGoogle: UserGoogle, spreadsheetId: string): Promise<void> {
    try {
      const headerData = [
        {
          range: 'Products!A1:D1',
          values: [['Name', 'Price', 'Quantity', 'Description']],
        },
        {
          range: 'Orders!A1:G1',
          values: [['Fullname', 'Product', 'Quantity', 'Total', 'Address', 'Note', 'Status']],
        },
      ];

      await this.batchUpdateValues(userGoogle, spreadsheetId, headerData);
    } catch (error) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.initializeSpreadsheetHeaders({ ...userGoogle, token: newToken }, spreadsheetId)
      ) as void;
    }
  }

  private async batchUpdateValues(
    userGoogle: UserGoogle,
    spreadsheetId: string,
    data: Array<{ range: string; values: (string | number)[][] }>
  ): Promise<void> {
    try {
      await this.makeRequest(`${this.baseUrl}/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ userGoogle.token }` },
        body: JSON.stringify({
          data,
          valueInputOption: 'USER_ENTERED',
        }),
      });
    } catch (error) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.batchUpdateValues({ ...userGoogle, token: newToken }, spreadsheetId, data)
      ) as void;
    }
  }

  // ============= DATA OPERATIONS =============
  async getSpreadsheet(userGoogle: UserGoogle, spreadsheetId: string): Promise<GoogleSpreadsheet> {
    try {
      const response = await this.makeRequest<GoogleSpreadsheet>(
        `${this.baseUrl}/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${userGoogle.token}` } }
      );
      return response;
    } catch (error) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.getSpreadsheet({ ...userGoogle, token: newToken }, spreadsheetId)
      );
    }
  }
  
  async getSheet(userGoogle: UserGoogle, spreadsheetId: string, sheetName: string, range = 'A1:Z'): Promise<string[][]> {
    try {
      const response = await this.makeRequest<{ values?: string[][] }>(
        `${this.baseUrl}/spreadsheets/${spreadsheetId}/values/${sheetName}!${range}`,
        { headers: { Authorization: `Bearer ${userGoogle.token}` } }
      );
      return response.values || [];
    } catch (error) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.getSheet({ ...userGoogle, token: newToken }, spreadsheetId, sheetName, range)
      ) as string[][];
    }
  }

  async getSheetProducts(userGoogle: UserGoogle, spreadsheetId: string): Promise<string[][]> {
    return this.getSheet(userGoogle, spreadsheetId, 'Products');
  }

  async getSheetOrders(userGoogle: UserGoogle, spreadsheetId: string): Promise<string[][]> {
    return this.getSheet(userGoogle, spreadsheetId, 'Orders');
  }

  async addProductToSheet(userGoogle: UserGoogle, spreadsheetId: string, product: Product): Promise<void> {
    await this.appendToSheet(userGoogle, spreadsheetId, 'Products', [
      [ product.name, product.price, product.quality, product.description ],
    ]);
  }

  async addOrderToSheet(userGoogle: UserGoogle, spreadsheetId: string, order: Order): Promise<void> {
    await this.appendToSheet(userGoogle, spreadsheetId, 'Orders', [
      [ order.fullname, order.product, order.quality, order.total, order.address, order.note, order.status || 'Pending' ],
    ]);
  }

  private async appendToSheet(
    userGoogle: UserGoogle,
    spreadsheetId: string,
    sheetName: string,
    values: (string | number)[][]
  ): Promise<void> {
    try {
      await this.makeRequest(`${this.baseUrl}/spreadsheets/${spreadsheetId}/values/${sheetName}:append`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userGoogle.token}` },
        body: JSON.stringify({
          values,
          valueInputOption: 'USER_ENTERED',
        }),
      });
    } catch (error) {
      return await this.invalidTokenErrorHandler(
        error,
        userGoogle.refresh_token,
        async (newToken) => await this.appendToSheet({ ...userGoogle, token: newToken }, spreadsheetId, sheetName, values)
      ) as void;
    }
  }

  // ============= FORMATE DATA ============= // copy past from Claude AI
  cleanHeaderName(header: string) {
    return header
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .split(' ')
      .map((word, index) => {
        if (index === 0) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('');
  }

  formatSheetsData(rawData: string[][]) {
    if (!rawData || rawData.length === 0) {
      return {
        columns: [],
        rows: []
      };
    }
  
    const columnHeaders = [ "Row", ...rawData[0] as string[] ] as string[];
    const dataRows = rawData.slice(1);
  
    const formatedData = dataRows.map((row, rowIndex) => {
      const formattedRow: Record<string, any> = { 
        row: String.fromCharCode(65).concat((rowIndex + 2).toString()),
      };

      columnHeaders.slice(1).forEach((header, colIndex) => {
        // Clean header name (remove spaces, make camelCase)
        const cleanHeader = this.cleanHeaderName(header);
        // Get cell value or empty string if undefined
        formattedRow[cleanHeader] = row[colIndex] || '';
      });
  
      return formattedRow;
    });
    
    return {
      columns: columnHeaders,
      rows: formatedData
    };
  }
}

export default GoogleApi;
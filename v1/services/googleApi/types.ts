interface GoogleSheetManagerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

interface Product {
  name: string;
  price: number;
  quantity: string;
  description: string;
}

interface Order {
  fullname: string;
  phone: string;
  productName: string;
  quantity: string;
  total: number;
  address: string;
  note: string;
  status?: string;
}

interface GoogleSpreadsheet {
  spreadsheetId: string;
  properties: {
    title: string;
    [key: string]: any,
  },
  sheets: {
    properties: {
      sheetId: number,
      title: string,
      [key: string]: any,
    }
  }[],
  [key: string]: any,
  spreadsheetUrl: string,
}

export type {
  GoogleSheetManagerConfig,
  GoogleUser,
  Product,
  Order,
  GoogleSpreadsheet
};
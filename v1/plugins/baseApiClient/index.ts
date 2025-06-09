abstract class BaseApiClient {
  protected async makeRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    try {
      // console.dir({ url, options }, { depth: null });
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        // console.dir({ url, error: errorData }, { depth: null });
        
        throw new Error(
          errorData.error?.message ||
          errorData.error_description ||
          errorData.error ||
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Request failed: ${JSON.stringify(error)}`);
    }
  }

  protected buildUrlWithParams(baseUrl: string, params: Record<string, string>): string {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    return url.toString();
  }

  protected createFormData(data: Record<string, string>): URLSearchParams {
    return new URLSearchParams(data);
  }
}

export default BaseApiClient;
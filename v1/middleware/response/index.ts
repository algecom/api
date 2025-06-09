import { Elysia } from "elysia";

export default (app: Elysia) => app
.onError(({ error }) => {
  console.log({ error });
  
  const result = {
    success: false,
    error: error instanceof Error ? error.message : String(error)
  };

  console.log({ response: result });

  return result;
})
.onAfterHandle(({ response, path }) => {
  let result;

  const excludeRoute: string[] = [ "/v1/facebook/webhook" ];
  
  // Exclude routes from being formatted as a well-formed success/failure response.
  if(excludeRoute.includes(path)) result = response;

  // If the response is already a well-formed success/failure response, leave it alone
  else if (
    typeof response === 'object' &&
    response !== null &&
    'success' in response
  ) result = response;

  // If the response contains an error field, treat it as an error
  else if (
    typeof response === 'object' &&
    response !== null &&
    'error' in response
  ) {
    result = {
      success: false,
      error: response.error
    };
  }

  // Otherwise, assume it's successful data
  else result = {
    success: true,
    data: response
  };

  console.log({ response: result });

  return result;
});
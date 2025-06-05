import { Elysia } from "elysia";

export default (app: Elysia) => app
.onError(({ error }) => {
  console.log({ error });
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error)
  };
})
.onAfterHandle(({ response }) => {
  console.log({ response });
  // If the response is already a well-formed success/failure response, leave it alone
  if (
    typeof response === 'object' &&
    response !== null &&
    'success' in response
  ) return response;

  // If the response contains an error field, treat it as an error
  if (
    typeof response === 'object' &&
    response !== null &&
    'error' in response
  ) {
    return {
      success: false,
      error: response.error
    };
  }

  // Otherwise, assume it's successful data
  return {
    success: true,
    data: response
  };
});
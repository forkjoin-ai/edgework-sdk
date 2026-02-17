# \ChatCompletionsApi

All URIs are relative to *https://edge.affectively.ai*

Method | HTTP request | Description
------------- | ------------- | -------------
[**CreateChatCompletion**](ChatCompletionsApi.md#CreateChatCompletion) | **Post** /chat/completions | Create chat completion



## CreateChatCompletion

> ChatCompletionResponse CreateChatCompletion(ctx).ChatCompletionRequest(chatCompletionRequest).XRequestID(xRequestID).XCorrelationID(xCorrelationID).Execute()

Create chat completion



### Example

```go
package main

import (
    "context"
    "fmt"
    "os"
    openapiclient "./openapi"
)

func main() {
    chatCompletionRequest := *openapiclient.NewChatCompletionRequest("mistral-7b", []openapiclient.Message{*openapiclient.NewMessage("Role_example", "TODO")}) // ChatCompletionRequest | 
    xRequestID := "xRequestID_example" // string | Optional request ID for tracking (optional)
    xCorrelationID := "xCorrelationID_example" // string | Optional correlation ID for distributed tracing (optional)

    configuration := openapiclient.NewConfiguration()
    apiClient := openapiclient.NewAPIClient(configuration)
    resp, r, err := apiClient.ChatCompletionsApi.CreateChatCompletion(context.Background()).ChatCompletionRequest(chatCompletionRequest).XRequestID(xRequestID).XCorrelationID(xCorrelationID).Execute()
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error when calling `ChatCompletionsApi.CreateChatCompletion``: %v\n", err)
        fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
    }
    // response from `CreateChatCompletion`: ChatCompletionResponse
    fmt.Fprintf(os.Stdout, "Response from `ChatCompletionsApi.CreateChatCompletion`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateChatCompletionRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **chatCompletionRequest** | [**ChatCompletionRequest**](ChatCompletionRequest.md) |  | 
 **xRequestID** | **string** | Optional request ID for tracking | 
 **xCorrelationID** | **string** | Optional correlation ID for distributed tracing | 

### Return type

[**ChatCompletionResponse**](ChatCompletionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth), [cloudflareAuth](../README.md#cloudflareAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


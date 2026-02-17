# \EmbeddingsApi

All URIs are relative to *https://edge.affectively.ai*

Method | HTTP request | Description
------------- | ------------- | -------------
[**CreateEmbeddings**](EmbeddingsApi.md#CreateEmbeddings) | **Post** /embeddings | Create embeddings



## CreateEmbeddings

> EmbeddingsResponse CreateEmbeddings(ctx).EmbeddingsRequest(embeddingsRequest).Execute()

Create embeddings



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
    embeddingsRequest := *openapiclient.NewEmbeddingsRequest("TODO", "mistral-7b") // EmbeddingsRequest | 

    configuration := openapiclient.NewConfiguration()
    apiClient := openapiclient.NewAPIClient(configuration)
    resp, r, err := apiClient.EmbeddingsApi.CreateEmbeddings(context.Background()).EmbeddingsRequest(embeddingsRequest).Execute()
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error when calling `EmbeddingsApi.CreateEmbeddings``: %v\n", err)
        fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
    }
    // response from `CreateEmbeddings`: EmbeddingsResponse
    fmt.Fprintf(os.Stdout, "Response from `EmbeddingsApi.CreateEmbeddings`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateEmbeddingsRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **embeddingsRequest** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |  | 

### Return type

[**EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth), [cloudflareAuth](../README.md#cloudflareAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


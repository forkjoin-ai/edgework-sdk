# \EmbeddingsApi

All URIs are relative to *https://edge.affectively.ai*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_embeddings**](EmbeddingsApi.md#create_embeddings) | **POST** /embeddings | Create embeddings



## create_embeddings

> crate::models::EmbeddingsResponse create_embeddings(embeddings_request)
Create embeddings

Generate vector embeddings for text, enabling semantic search and similarity analysis.  ## Use Cases - Semantic search across emotions and reflections - Clustering similar emotional states - Finding related tools or coping strategies - Recommendation systems  ## Token Counting Embeddings count tokens the same as chat completions. All models are self-hosted with no per-token costs. 

### Parameters


Name | Type | Description  | Required | Notes
------------- | ------------- | ------------- | ------------- | -------------
**embeddings_request** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |  | [required] |

### Return type

[**crate::models::EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth), [cloudflareAuth](../README.md#cloudflareAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)


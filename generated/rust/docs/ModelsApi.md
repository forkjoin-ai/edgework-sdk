# \ModelsApi

All URIs are relative to *https://edge.affectively.ai*

Method | HTTP request | Description
------------- | ------------- | -------------
[**list_models**](ModelsApi.md#list_models) | **GET** /models | List available models



## list_models

> crate::models::ModelsResponse list_models()
List available models

Retrieve information about all available models and their capabilities.  Returns model details including: - Model ID and name - Provider (Cloudflare Workers or Cloud Run) - Capabilities (chat, embeddings, vision, audio, translation) - Token limits (input/output context windows) - Rate limits - Latest update  ## Text Models - mistral-7b, llama-70b, llama-13b, glm-4.7, qwen-edit - tinyllama-1.1b, deepseek-1.5b, deepseek-3b  ## Vision/Audio/Translation Models - flux-4b (image generation) - vibevoice-9b (TTS) - translategemma-4b (translation) 

### Parameters

This endpoint does not need any parameter.

### Return type

[**crate::models::ModelsResponse**](ModelsResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth), [cloudflareAuth](../README.md#cloudflareAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)


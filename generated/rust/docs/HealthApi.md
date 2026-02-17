# \HealthApi

All URIs are relative to *https://edge.affectively.ai*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_health**](HealthApi.md#get_health) | **GET** /health | Health check



## get_health

> crate::models::HealthResponse get_health()
Health check

Check the health status of the AI Gateway and all connected providers.  Returns status information including: - Gateway status (operational/degraded/offline) - Provider status (each provider's current status) - Rate limit status (current usage vs limits) - Token counter status - Cache status 

### Parameters

This endpoint does not need any parameter.

### Return type

[**crate::models::HealthResponse**](HealthResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth), [cloudflareAuth](../README.md#cloudflareAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)


# \ChatCompletionsApi

All URIs are relative to *https://edge.affectively.ai*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_chat_completion**](ChatCompletionsApi.md#create_chat_completion) | **POST** /chat/completions | Create chat completion



## create_chat_completion

> crate::models::ChatCompletionResponse create_chat_completion(chat_completion_request, x_request_id, x_correlation_id)
Create chat completion

Generate text responses using a specified language model.  ## Advanced Modalities  ### Ensemble Mode Sends the same prompt to multiple models and combines responses intelligently: - **Ensemble Cost**: Input tokens charged once; output tokens for each model - **Use Cases**: High-stakes decisions requiring diverse perspectives - **Response Merging**: Results are combined based on agreement and confidence  ### Meta-Metacognition Enables multi-layer reasoning where models analyze their own reasoning: - **Layer 1**: Initial response generation - **Layer 2**: Self-reflection on reasoning process - **Layer 3**: Meta-analysis of reflection quality - **Cost Impact**: 3x token usage (one per layer) - **Benefit**: More nuanced, self-aware responses  ### Monte Carlo Analysis Runs multiple probabilistic iterations to handle uncertainty: - **Iterations**: Configurable (typically 5-20 runs) - **Token Cost**: `num_iterations × base_tokens` - **Use Cases**: Probability estimation, scenario analysis, risk assessment - **Convergence**: Results stabilize with more iterations - **Standard Deviation**: Measure of response variability 

### Parameters


Name | Type | Description  | Required | Notes
------------- | ------------- | ------------- | ------------- | -------------
**chat_completion_request** | [**ChatCompletionRequest**](ChatCompletionRequest.md) |  | [required] |
**x_request_id** | Option<**String**> | Optional request ID for tracking |  |
**x_correlation_id** | Option<**String**> | Optional correlation ID for distributed tracing |  |

### Return type

[**crate::models::ChatCompletionResponse**](ChatCompletionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth), [cloudflareAuth](../README.md#cloudflareAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)


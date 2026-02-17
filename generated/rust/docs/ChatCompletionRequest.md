# ChatCompletionRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**model** | **String** | Model identifier. Can be: - Text models: \"mistral-7b\", \"llama-70b\", \"llama-13b\", \"glm-4.7\", \"qwen-edit\", \"tinyllama-1.1b\", \"deepseek-1.5b\", \"deepseek-3b\" - Vision: \"flux-4b\" - Audio: \"vibevoice-9b\" - Translation: \"translategemma-4b\" - Special modes: \"ensemble\" (multiple models), \"auto\" (best available)  | 
**messages** | [**Vec<crate::models::Message>**](Message.md) | Array of message objects forming the conversation history. Each message has a role (system, user, assistant) and content.  | 
**temperature** | Option<**f32**> | Controls randomness. Lower = more deterministic, Higher = more creative - 0: Deterministic (best for analysis) - 0.7: Balanced (recommended for most tasks) - 1.5+: Creative (for brainstorming)  | [optional][default to 1]
**max_tokens** | Option<**i32**> | Maximum number of tokens to generate | [optional]
**top_p** | Option<**f32**> | Nucleus sampling. Controls diversity of top choices. Only used when temperature > 0  | [optional][default to 1]
**top_k** | Option<**i32**> | Only sample from the K most likely tokens. For reducing output variability without lowering temperature.  | [optional]
**models** | Option<**Vec<String>**> | For ensemble mode: array of model IDs to use. Each model receives the same input and outputs are combined.  | [optional]
**ensemble_strategy** | Option<**String**> | How to combine ensemble results: - weighted_average: Combine based on confidence scores - voting: Majority rule - consensus: Only return if models agree above threshold - synthesis: AI-generated synthesis of perspectives  | [optional][default to EnsembleStrategy_Synthesis]
**metadata** | Option<[**crate::models::ChatCompletionRequestMetadata**](ChatCompletionRequest_metadata.md)> |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



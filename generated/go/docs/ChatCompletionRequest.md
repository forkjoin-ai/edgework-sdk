# ChatCompletionRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** | Model identifier. Can be: - Text models: \&quot;mistral-7b\&quot;, \&quot;llama-70b\&quot;, \&quot;llama-13b\&quot;, \&quot;glm-4.7\&quot;, \&quot;qwen-edit\&quot;, \&quot;tinyllama-1.1b\&quot;, \&quot;deepseek-1.5b\&quot;, \&quot;deepseek-3b\&quot; - Vision: \&quot;flux-4b\&quot; - Audio: \&quot;vibevoice-9b\&quot; - Translation: \&quot;translategemma-4b\&quot; - Special modes: \&quot;ensemble\&quot; (multiple models), \&quot;auto\&quot; (best available)  | 
**Messages** | [**[]Message**](Message.md) | Array of message objects forming the conversation history. Each message has a role (system, user, assistant) and content.  | 
**Temperature** | Pointer to **float32** | Controls randomness. Lower &#x3D; more deterministic, Higher &#x3D; more creative - 0: Deterministic (best for analysis) - 0.7: Balanced (recommended for most tasks) - 1.5+: Creative (for brainstorming)  | [optional] [default to 1]
**MaxTokens** | Pointer to **int32** | Maximum number of tokens to generate | [optional] 
**TopP** | Pointer to **float32** | Nucleus sampling. Controls diversity of top choices. Only used when temperature &gt; 0  | [optional] [default to 1]
**TopK** | Pointer to **int32** | Only sample from the K most likely tokens. For reducing output variability without lowering temperature.  | [optional] 
**Models** | Pointer to **[]string** | For ensemble mode: array of model IDs to use. Each model receives the same input and outputs are combined.  | [optional] 
**EnsembleStrategy** | Pointer to **string** | How to combine ensemble results: - weighted_average: Combine based on confidence scores - voting: Majority rule - consensus: Only return if models agree above threshold - synthesis: AI-generated synthesis of perspectives  | [optional] [default to "synthesis"]
**Metadata** | Pointer to [**ChatCompletionRequestMetadata**](ChatCompletionRequestMetadata.md) |  | [optional] 

## Methods

### NewChatCompletionRequest

`func NewChatCompletionRequest(model string, messages []Message, ) *ChatCompletionRequest`

NewChatCompletionRequest instantiates a new ChatCompletionRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionRequestWithDefaults

`func NewChatCompletionRequestWithDefaults() *ChatCompletionRequest`

NewChatCompletionRequestWithDefaults instantiates a new ChatCompletionRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *ChatCompletionRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ChatCompletionRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ChatCompletionRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetMessages

`func (o *ChatCompletionRequest) GetMessages() []Message`

GetMessages returns the Messages field if non-nil, zero value otherwise.

### GetMessagesOk

`func (o *ChatCompletionRequest) GetMessagesOk() (*[]Message, bool)`

GetMessagesOk returns a tuple with the Messages field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMessages

`func (o *ChatCompletionRequest) SetMessages(v []Message)`

SetMessages sets Messages field to given value.


### GetTemperature

`func (o *ChatCompletionRequest) GetTemperature() float32`

GetTemperature returns the Temperature field if non-nil, zero value otherwise.

### GetTemperatureOk

`func (o *ChatCompletionRequest) GetTemperatureOk() (*float32, bool)`

GetTemperatureOk returns a tuple with the Temperature field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTemperature

`func (o *ChatCompletionRequest) SetTemperature(v float32)`

SetTemperature sets Temperature field to given value.

### HasTemperature

`func (o *ChatCompletionRequest) HasTemperature() bool`

HasTemperature returns a boolean if a field has been set.

### GetMaxTokens

`func (o *ChatCompletionRequest) GetMaxTokens() int32`

GetMaxTokens returns the MaxTokens field if non-nil, zero value otherwise.

### GetMaxTokensOk

`func (o *ChatCompletionRequest) GetMaxTokensOk() (*int32, bool)`

GetMaxTokensOk returns a tuple with the MaxTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxTokens

`func (o *ChatCompletionRequest) SetMaxTokens(v int32)`

SetMaxTokens sets MaxTokens field to given value.

### HasMaxTokens

`func (o *ChatCompletionRequest) HasMaxTokens() bool`

HasMaxTokens returns a boolean if a field has been set.

### GetTopP

`func (o *ChatCompletionRequest) GetTopP() float32`

GetTopP returns the TopP field if non-nil, zero value otherwise.

### GetTopPOk

`func (o *ChatCompletionRequest) GetTopPOk() (*float32, bool)`

GetTopPOk returns a tuple with the TopP field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopP

`func (o *ChatCompletionRequest) SetTopP(v float32)`

SetTopP sets TopP field to given value.

### HasTopP

`func (o *ChatCompletionRequest) HasTopP() bool`

HasTopP returns a boolean if a field has been set.

### GetTopK

`func (o *ChatCompletionRequest) GetTopK() int32`

GetTopK returns the TopK field if non-nil, zero value otherwise.

### GetTopKOk

`func (o *ChatCompletionRequest) GetTopKOk() (*int32, bool)`

GetTopKOk returns a tuple with the TopK field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopK

`func (o *ChatCompletionRequest) SetTopK(v int32)`

SetTopK sets TopK field to given value.

### HasTopK

`func (o *ChatCompletionRequest) HasTopK() bool`

HasTopK returns a boolean if a field has been set.

### GetModels

`func (o *ChatCompletionRequest) GetModels() []string`

GetModels returns the Models field if non-nil, zero value otherwise.

### GetModelsOk

`func (o *ChatCompletionRequest) GetModelsOk() (*[]string, bool)`

GetModelsOk returns a tuple with the Models field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModels

`func (o *ChatCompletionRequest) SetModels(v []string)`

SetModels sets Models field to given value.

### HasModels

`func (o *ChatCompletionRequest) HasModels() bool`

HasModels returns a boolean if a field has been set.

### GetEnsembleStrategy

`func (o *ChatCompletionRequest) GetEnsembleStrategy() string`

GetEnsembleStrategy returns the EnsembleStrategy field if non-nil, zero value otherwise.

### GetEnsembleStrategyOk

`func (o *ChatCompletionRequest) GetEnsembleStrategyOk() (*string, bool)`

GetEnsembleStrategyOk returns a tuple with the EnsembleStrategy field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEnsembleStrategy

`func (o *ChatCompletionRequest) SetEnsembleStrategy(v string)`

SetEnsembleStrategy sets EnsembleStrategy field to given value.

### HasEnsembleStrategy

`func (o *ChatCompletionRequest) HasEnsembleStrategy() bool`

HasEnsembleStrategy returns a boolean if a field has been set.

### GetMetadata

`func (o *ChatCompletionRequest) GetMetadata() ChatCompletionRequestMetadata`

GetMetadata returns the Metadata field if non-nil, zero value otherwise.

### GetMetadataOk

`func (o *ChatCompletionRequest) GetMetadataOk() (*ChatCompletionRequestMetadata, bool)`

GetMetadataOk returns a tuple with the Metadata field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMetadata

`func (o *ChatCompletionRequest) SetMetadata(v ChatCompletionRequestMetadata)`

SetMetadata sets Metadata field to given value.

### HasMetadata

`func (o *ChatCompletionRequest) HasMetadata() bool`

HasMetadata returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



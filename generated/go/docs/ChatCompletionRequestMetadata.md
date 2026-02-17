# ChatCompletionRequestMetadata

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**EnableMetaMetacognition** | Pointer to **bool** | Enable multi-layer reasoning analysis | [optional] 
**ReflectionDepth** | Pointer to **int32** | Depth of self-reflection (1-5 layers) | [optional] 
**EnableMonteCarlo** | Pointer to **bool** | Enable probabilistic Monte Carlo analysis | [optional] 
**Iterations** | Pointer to **int32** | Number of Monte Carlo iterations | [optional] 
**AnalysisType** | Pointer to **string** | Type of Monte Carlo analysis | [optional] 
**CacheKey** | Pointer to **string** | Optional cache key for repeated requests | [optional] 

## Methods

### NewChatCompletionRequestMetadata

`func NewChatCompletionRequestMetadata() *ChatCompletionRequestMetadata`

NewChatCompletionRequestMetadata instantiates a new ChatCompletionRequestMetadata object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionRequestMetadataWithDefaults

`func NewChatCompletionRequestMetadataWithDefaults() *ChatCompletionRequestMetadata`

NewChatCompletionRequestMetadataWithDefaults instantiates a new ChatCompletionRequestMetadata object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEnableMetaMetacognition

`func (o *ChatCompletionRequestMetadata) GetEnableMetaMetacognition() bool`

GetEnableMetaMetacognition returns the EnableMetaMetacognition field if non-nil, zero value otherwise.

### GetEnableMetaMetacognitionOk

`func (o *ChatCompletionRequestMetadata) GetEnableMetaMetacognitionOk() (*bool, bool)`

GetEnableMetaMetacognitionOk returns a tuple with the EnableMetaMetacognition field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEnableMetaMetacognition

`func (o *ChatCompletionRequestMetadata) SetEnableMetaMetacognition(v bool)`

SetEnableMetaMetacognition sets EnableMetaMetacognition field to given value.

### HasEnableMetaMetacognition

`func (o *ChatCompletionRequestMetadata) HasEnableMetaMetacognition() bool`

HasEnableMetaMetacognition returns a boolean if a field has been set.

### GetReflectionDepth

`func (o *ChatCompletionRequestMetadata) GetReflectionDepth() int32`

GetReflectionDepth returns the ReflectionDepth field if non-nil, zero value otherwise.

### GetReflectionDepthOk

`func (o *ChatCompletionRequestMetadata) GetReflectionDepthOk() (*int32, bool)`

GetReflectionDepthOk returns a tuple with the ReflectionDepth field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReflectionDepth

`func (o *ChatCompletionRequestMetadata) SetReflectionDepth(v int32)`

SetReflectionDepth sets ReflectionDepth field to given value.

### HasReflectionDepth

`func (o *ChatCompletionRequestMetadata) HasReflectionDepth() bool`

HasReflectionDepth returns a boolean if a field has been set.

### GetEnableMonteCarlo

`func (o *ChatCompletionRequestMetadata) GetEnableMonteCarlo() bool`

GetEnableMonteCarlo returns the EnableMonteCarlo field if non-nil, zero value otherwise.

### GetEnableMonteCarloOk

`func (o *ChatCompletionRequestMetadata) GetEnableMonteCarloOk() (*bool, bool)`

GetEnableMonteCarloOk returns a tuple with the EnableMonteCarlo field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEnableMonteCarlo

`func (o *ChatCompletionRequestMetadata) SetEnableMonteCarlo(v bool)`

SetEnableMonteCarlo sets EnableMonteCarlo field to given value.

### HasEnableMonteCarlo

`func (o *ChatCompletionRequestMetadata) HasEnableMonteCarlo() bool`

HasEnableMonteCarlo returns a boolean if a field has been set.

### GetIterations

`func (o *ChatCompletionRequestMetadata) GetIterations() int32`

GetIterations returns the Iterations field if non-nil, zero value otherwise.

### GetIterationsOk

`func (o *ChatCompletionRequestMetadata) GetIterationsOk() (*int32, bool)`

GetIterationsOk returns a tuple with the Iterations field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIterations

`func (o *ChatCompletionRequestMetadata) SetIterations(v int32)`

SetIterations sets Iterations field to given value.

### HasIterations

`func (o *ChatCompletionRequestMetadata) HasIterations() bool`

HasIterations returns a boolean if a field has been set.

### GetAnalysisType

`func (o *ChatCompletionRequestMetadata) GetAnalysisType() string`

GetAnalysisType returns the AnalysisType field if non-nil, zero value otherwise.

### GetAnalysisTypeOk

`func (o *ChatCompletionRequestMetadata) GetAnalysisTypeOk() (*string, bool)`

GetAnalysisTypeOk returns a tuple with the AnalysisType field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAnalysisType

`func (o *ChatCompletionRequestMetadata) SetAnalysisType(v string)`

SetAnalysisType sets AnalysisType field to given value.

### HasAnalysisType

`func (o *ChatCompletionRequestMetadata) HasAnalysisType() bool`

HasAnalysisType returns a boolean if a field has been set.

### GetCacheKey

`func (o *ChatCompletionRequestMetadata) GetCacheKey() string`

GetCacheKey returns the CacheKey field if non-nil, zero value otherwise.

### GetCacheKeyOk

`func (o *ChatCompletionRequestMetadata) GetCacheKeyOk() (*string, bool)`

GetCacheKeyOk returns a tuple with the CacheKey field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCacheKey

`func (o *ChatCompletionRequestMetadata) SetCacheKey(v string)`

SetCacheKey sets CacheKey field to given value.

### HasCacheKey

`func (o *ChatCompletionRequestMetadata) HasCacheKey() bool`

HasCacheKey returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



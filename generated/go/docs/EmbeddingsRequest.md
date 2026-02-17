# EmbeddingsRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Input** | [**OneOfstringarray**](oneOf&lt;string,array&gt;.md) | Text or array of texts to embed | 
**Model** | **string** | Model to use for embeddings | 

## Methods

### NewEmbeddingsRequest

`func NewEmbeddingsRequest(input OneOfstringarray, model string, ) *EmbeddingsRequest`

NewEmbeddingsRequest instantiates a new EmbeddingsRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewEmbeddingsRequestWithDefaults

`func NewEmbeddingsRequestWithDefaults() *EmbeddingsRequest`

NewEmbeddingsRequestWithDefaults instantiates a new EmbeddingsRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetInput

`func (o *EmbeddingsRequest) GetInput() OneOfstringarray`

GetInput returns the Input field if non-nil, zero value otherwise.

### GetInputOk

`func (o *EmbeddingsRequest) GetInputOk() (*OneOfstringarray, bool)`

GetInputOk returns a tuple with the Input field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInput

`func (o *EmbeddingsRequest) SetInput(v OneOfstringarray)`

SetInput sets Input field to given value.


### SetInputNil

`func (o *EmbeddingsRequest) SetInputNil(b bool)`

 SetInputNil sets the value for Input to be an explicit nil

### UnsetInput
`func (o *EmbeddingsRequest) UnsetInput()`

UnsetInput ensures that no value is present for Input, not even an explicit nil
### GetModel

`func (o *EmbeddingsRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *EmbeddingsRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *EmbeddingsRequest) SetModel(v string)`

SetModel sets Model field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



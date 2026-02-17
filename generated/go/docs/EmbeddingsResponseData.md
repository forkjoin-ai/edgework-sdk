# EmbeddingsResponseData

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Object** | Pointer to **string** |  | [optional] 
**Embedding** | Pointer to **[]float32** |  | [optional] 
**Index** | Pointer to **int32** |  | [optional] 

## Methods

### NewEmbeddingsResponseData

`func NewEmbeddingsResponseData() *EmbeddingsResponseData`

NewEmbeddingsResponseData instantiates a new EmbeddingsResponseData object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewEmbeddingsResponseDataWithDefaults

`func NewEmbeddingsResponseDataWithDefaults() *EmbeddingsResponseData`

NewEmbeddingsResponseDataWithDefaults instantiates a new EmbeddingsResponseData object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetObject

`func (o *EmbeddingsResponseData) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *EmbeddingsResponseData) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *EmbeddingsResponseData) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *EmbeddingsResponseData) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetEmbedding

`func (o *EmbeddingsResponseData) GetEmbedding() []float32`

GetEmbedding returns the Embedding field if non-nil, zero value otherwise.

### GetEmbeddingOk

`func (o *EmbeddingsResponseData) GetEmbeddingOk() (*[]float32, bool)`

GetEmbeddingOk returns a tuple with the Embedding field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEmbedding

`func (o *EmbeddingsResponseData) SetEmbedding(v []float32)`

SetEmbedding sets Embedding field to given value.

### HasEmbedding

`func (o *EmbeddingsResponseData) HasEmbedding() bool`

HasEmbedding returns a boolean if a field has been set.

### GetIndex

`func (o *EmbeddingsResponseData) GetIndex() int32`

GetIndex returns the Index field if non-nil, zero value otherwise.

### GetIndexOk

`func (o *EmbeddingsResponseData) GetIndexOk() (*int32, bool)`

GetIndexOk returns a tuple with the Index field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIndex

`func (o *EmbeddingsResponseData) SetIndex(v int32)`

SetIndex sets Index field to given value.

### HasIndex

`func (o *EmbeddingsResponseData) HasIndex() bool`

HasIndex returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



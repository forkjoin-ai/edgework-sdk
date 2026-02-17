# Choice

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**FinishReason** | Pointer to **string** |  | [optional] 
**Index** | Pointer to **int32** |  | [optional] 
**Message** | Pointer to [**Message**](Message.md) |  | [optional] 
**EnsembleResults** | Pointer to [**ChoiceEnsembleResults**](ChoiceEnsembleResults.md) |  | [optional] 
**MonteCarloResults** | Pointer to [**ChoiceMonteCarloResults**](ChoiceMonteCarloResults.md) |  | [optional] 

## Methods

### NewChoice

`func NewChoice() *Choice`

NewChoice instantiates a new Choice object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChoiceWithDefaults

`func NewChoiceWithDefaults() *Choice`

NewChoiceWithDefaults instantiates a new Choice object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetFinishReason

`func (o *Choice) GetFinishReason() string`

GetFinishReason returns the FinishReason field if non-nil, zero value otherwise.

### GetFinishReasonOk

`func (o *Choice) GetFinishReasonOk() (*string, bool)`

GetFinishReasonOk returns a tuple with the FinishReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFinishReason

`func (o *Choice) SetFinishReason(v string)`

SetFinishReason sets FinishReason field to given value.

### HasFinishReason

`func (o *Choice) HasFinishReason() bool`

HasFinishReason returns a boolean if a field has been set.

### GetIndex

`func (o *Choice) GetIndex() int32`

GetIndex returns the Index field if non-nil, zero value otherwise.

### GetIndexOk

`func (o *Choice) GetIndexOk() (*int32, bool)`

GetIndexOk returns a tuple with the Index field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIndex

`func (o *Choice) SetIndex(v int32)`

SetIndex sets Index field to given value.

### HasIndex

`func (o *Choice) HasIndex() bool`

HasIndex returns a boolean if a field has been set.

### GetMessage

`func (o *Choice) GetMessage() Message`

GetMessage returns the Message field if non-nil, zero value otherwise.

### GetMessageOk

`func (o *Choice) GetMessageOk() (*Message, bool)`

GetMessageOk returns a tuple with the Message field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMessage

`func (o *Choice) SetMessage(v Message)`

SetMessage sets Message field to given value.

### HasMessage

`func (o *Choice) HasMessage() bool`

HasMessage returns a boolean if a field has been set.

### GetEnsembleResults

`func (o *Choice) GetEnsembleResults() ChoiceEnsembleResults`

GetEnsembleResults returns the EnsembleResults field if non-nil, zero value otherwise.

### GetEnsembleResultsOk

`func (o *Choice) GetEnsembleResultsOk() (*ChoiceEnsembleResults, bool)`

GetEnsembleResultsOk returns a tuple with the EnsembleResults field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEnsembleResults

`func (o *Choice) SetEnsembleResults(v ChoiceEnsembleResults)`

SetEnsembleResults sets EnsembleResults field to given value.

### HasEnsembleResults

`func (o *Choice) HasEnsembleResults() bool`

HasEnsembleResults returns a boolean if a field has been set.

### GetMonteCarloResults

`func (o *Choice) GetMonteCarloResults() ChoiceMonteCarloResults`

GetMonteCarloResults returns the MonteCarloResults field if non-nil, zero value otherwise.

### GetMonteCarloResultsOk

`func (o *Choice) GetMonteCarloResultsOk() (*ChoiceMonteCarloResults, bool)`

GetMonteCarloResultsOk returns a tuple with the MonteCarloResults field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMonteCarloResults

`func (o *Choice) SetMonteCarloResults(v ChoiceMonteCarloResults)`

SetMonteCarloResults sets MonteCarloResults field to given value.

### HasMonteCarloResults

`func (o *Choice) HasMonteCarloResults() bool`

HasMonteCarloResults returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



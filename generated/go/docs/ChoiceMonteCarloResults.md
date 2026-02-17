# ChoiceMonteCarloResults

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**PointEstimate** | Pointer to **float32** |  | [optional] 
**ConfidenceInterval** | Pointer to **map[string]interface{}** |  | [optional] 
**StandardDeviation** | Pointer to **float32** |  | [optional] 
**IterationsConverged** | Pointer to **int32** |  | [optional] 

## Methods

### NewChoiceMonteCarloResults

`func NewChoiceMonteCarloResults() *ChoiceMonteCarloResults`

NewChoiceMonteCarloResults instantiates a new ChoiceMonteCarloResults object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChoiceMonteCarloResultsWithDefaults

`func NewChoiceMonteCarloResultsWithDefaults() *ChoiceMonteCarloResults`

NewChoiceMonteCarloResultsWithDefaults instantiates a new ChoiceMonteCarloResults object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetPointEstimate

`func (o *ChoiceMonteCarloResults) GetPointEstimate() float32`

GetPointEstimate returns the PointEstimate field if non-nil, zero value otherwise.

### GetPointEstimateOk

`func (o *ChoiceMonteCarloResults) GetPointEstimateOk() (*float32, bool)`

GetPointEstimateOk returns a tuple with the PointEstimate field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPointEstimate

`func (o *ChoiceMonteCarloResults) SetPointEstimate(v float32)`

SetPointEstimate sets PointEstimate field to given value.

### HasPointEstimate

`func (o *ChoiceMonteCarloResults) HasPointEstimate() bool`

HasPointEstimate returns a boolean if a field has been set.

### GetConfidenceInterval

`func (o *ChoiceMonteCarloResults) GetConfidenceInterval() map[string]interface{}`

GetConfidenceInterval returns the ConfidenceInterval field if non-nil, zero value otherwise.

### GetConfidenceIntervalOk

`func (o *ChoiceMonteCarloResults) GetConfidenceIntervalOk() (*map[string]interface{}, bool)`

GetConfidenceIntervalOk returns a tuple with the ConfidenceInterval field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetConfidenceInterval

`func (o *ChoiceMonteCarloResults) SetConfidenceInterval(v map[string]interface{})`

SetConfidenceInterval sets ConfidenceInterval field to given value.

### HasConfidenceInterval

`func (o *ChoiceMonteCarloResults) HasConfidenceInterval() bool`

HasConfidenceInterval returns a boolean if a field has been set.

### GetStandardDeviation

`func (o *ChoiceMonteCarloResults) GetStandardDeviation() float32`

GetStandardDeviation returns the StandardDeviation field if non-nil, zero value otherwise.

### GetStandardDeviationOk

`func (o *ChoiceMonteCarloResults) GetStandardDeviationOk() (*float32, bool)`

GetStandardDeviationOk returns a tuple with the StandardDeviation field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStandardDeviation

`func (o *ChoiceMonteCarloResults) SetStandardDeviation(v float32)`

SetStandardDeviation sets StandardDeviation field to given value.

### HasStandardDeviation

`func (o *ChoiceMonteCarloResults) HasStandardDeviation() bool`

HasStandardDeviation returns a boolean if a field has been set.

### GetIterationsConverged

`func (o *ChoiceMonteCarloResults) GetIterationsConverged() int32`

GetIterationsConverged returns the IterationsConverged field if non-nil, zero value otherwise.

### GetIterationsConvergedOk

`func (o *ChoiceMonteCarloResults) GetIterationsConvergedOk() (*int32, bool)`

GetIterationsConvergedOk returns a tuple with the IterationsConverged field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIterationsConverged

`func (o *ChoiceMonteCarloResults) SetIterationsConverged(v int32)`

SetIterationsConverged sets IterationsConverged field to given value.

### HasIterationsConverged

`func (o *ChoiceMonteCarloResults) HasIterationsConverged() bool`

HasIterationsConverged returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



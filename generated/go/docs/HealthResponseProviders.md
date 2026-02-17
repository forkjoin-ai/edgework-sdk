# HealthResponseProviders

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Status** | Pointer to **string** |  | [optional] 
**LatencyMs** | Pointer to **float32** |  | [optional] 
**AvailableModels** | Pointer to **int32** |  | [optional] 

## Methods

### NewHealthResponseProviders

`func NewHealthResponseProviders() *HealthResponseProviders`

NewHealthResponseProviders instantiates a new HealthResponseProviders object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewHealthResponseProvidersWithDefaults

`func NewHealthResponseProvidersWithDefaults() *HealthResponseProviders`

NewHealthResponseProvidersWithDefaults instantiates a new HealthResponseProviders object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetStatus

`func (o *HealthResponseProviders) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *HealthResponseProviders) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *HealthResponseProviders) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *HealthResponseProviders) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetLatencyMs

`func (o *HealthResponseProviders) GetLatencyMs() float32`

GetLatencyMs returns the LatencyMs field if non-nil, zero value otherwise.

### GetLatencyMsOk

`func (o *HealthResponseProviders) GetLatencyMsOk() (*float32, bool)`

GetLatencyMsOk returns a tuple with the LatencyMs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLatencyMs

`func (o *HealthResponseProviders) SetLatencyMs(v float32)`

SetLatencyMs sets LatencyMs field to given value.

### HasLatencyMs

`func (o *HealthResponseProviders) HasLatencyMs() bool`

HasLatencyMs returns a boolean if a field has been set.

### GetAvailableModels

`func (o *HealthResponseProviders) GetAvailableModels() int32`

GetAvailableModels returns the AvailableModels field if non-nil, zero value otherwise.

### GetAvailableModelsOk

`func (o *HealthResponseProviders) GetAvailableModelsOk() (*int32, bool)`

GetAvailableModelsOk returns a tuple with the AvailableModels field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAvailableModels

`func (o *HealthResponseProviders) SetAvailableModels(v int32)`

SetAvailableModels sets AvailableModels field to given value.

### HasAvailableModels

`func (o *HealthResponseProviders) HasAvailableModels() bool`

HasAvailableModels returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



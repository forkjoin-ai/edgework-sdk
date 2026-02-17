# HealthResponseGateway

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Status** | Pointer to **string** |  | [optional] 
**LatencyMs** | Pointer to **float32** |  | [optional] 

## Methods

### NewHealthResponseGateway

`func NewHealthResponseGateway() *HealthResponseGateway`

NewHealthResponseGateway instantiates a new HealthResponseGateway object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewHealthResponseGatewayWithDefaults

`func NewHealthResponseGatewayWithDefaults() *HealthResponseGateway`

NewHealthResponseGatewayWithDefaults instantiates a new HealthResponseGateway object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetStatus

`func (o *HealthResponseGateway) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *HealthResponseGateway) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *HealthResponseGateway) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *HealthResponseGateway) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetLatencyMs

`func (o *HealthResponseGateway) GetLatencyMs() float32`

GetLatencyMs returns the LatencyMs field if non-nil, zero value otherwise.

### GetLatencyMsOk

`func (o *HealthResponseGateway) GetLatencyMsOk() (*float32, bool)`

GetLatencyMsOk returns a tuple with the LatencyMs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLatencyMs

`func (o *HealthResponseGateway) SetLatencyMs(v float32)`

SetLatencyMs sets LatencyMs field to given value.

### HasLatencyMs

`func (o *HealthResponseGateway) HasLatencyMs() bool`

HasLatencyMs returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



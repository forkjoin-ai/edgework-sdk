# HealthResponseRateLimits

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**CurrentUsage** | Pointer to **float32** |  | [optional] 
**Limit** | Pointer to **float32** |  | [optional] 
**ResetAt** | Pointer to **time.Time** |  | [optional] 

## Methods

### NewHealthResponseRateLimits

`func NewHealthResponseRateLimits() *HealthResponseRateLimits`

NewHealthResponseRateLimits instantiates a new HealthResponseRateLimits object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewHealthResponseRateLimitsWithDefaults

`func NewHealthResponseRateLimitsWithDefaults() *HealthResponseRateLimits`

NewHealthResponseRateLimitsWithDefaults instantiates a new HealthResponseRateLimits object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetCurrentUsage

`func (o *HealthResponseRateLimits) GetCurrentUsage() float32`

GetCurrentUsage returns the CurrentUsage field if non-nil, zero value otherwise.

### GetCurrentUsageOk

`func (o *HealthResponseRateLimits) GetCurrentUsageOk() (*float32, bool)`

GetCurrentUsageOk returns a tuple with the CurrentUsage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCurrentUsage

`func (o *HealthResponseRateLimits) SetCurrentUsage(v float32)`

SetCurrentUsage sets CurrentUsage field to given value.

### HasCurrentUsage

`func (o *HealthResponseRateLimits) HasCurrentUsage() bool`

HasCurrentUsage returns a boolean if a field has been set.

### GetLimit

`func (o *HealthResponseRateLimits) GetLimit() float32`

GetLimit returns the Limit field if non-nil, zero value otherwise.

### GetLimitOk

`func (o *HealthResponseRateLimits) GetLimitOk() (*float32, bool)`

GetLimitOk returns a tuple with the Limit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimit

`func (o *HealthResponseRateLimits) SetLimit(v float32)`

SetLimit sets Limit field to given value.

### HasLimit

`func (o *HealthResponseRateLimits) HasLimit() bool`

HasLimit returns a boolean if a field has been set.

### GetResetAt

`func (o *HealthResponseRateLimits) GetResetAt() time.Time`

GetResetAt returns the ResetAt field if non-nil, zero value otherwise.

### GetResetAtOk

`func (o *HealthResponseRateLimits) GetResetAtOk() (*time.Time, bool)`

GetResetAtOk returns a tuple with the ResetAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResetAt

`func (o *HealthResponseRateLimits) SetResetAt(v time.Time)`

SetResetAt sets ResetAt field to given value.

### HasResetAt

`func (o *HealthResponseRateLimits) HasResetAt() bool`

HasResetAt returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



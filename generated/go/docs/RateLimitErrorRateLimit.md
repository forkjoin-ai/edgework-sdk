# RateLimitErrorRateLimit

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**LimitPerMinute** | Pointer to **int32** |  | [optional] 
**Remaining** | Pointer to **int32** |  | [optional] 
**ResetInSeconds** | Pointer to **int32** |  | [optional] 

## Methods

### NewRateLimitErrorRateLimit

`func NewRateLimitErrorRateLimit() *RateLimitErrorRateLimit`

NewRateLimitErrorRateLimit instantiates a new RateLimitErrorRateLimit object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewRateLimitErrorRateLimitWithDefaults

`func NewRateLimitErrorRateLimitWithDefaults() *RateLimitErrorRateLimit`

NewRateLimitErrorRateLimitWithDefaults instantiates a new RateLimitErrorRateLimit object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetLimitPerMinute

`func (o *RateLimitErrorRateLimit) GetLimitPerMinute() int32`

GetLimitPerMinute returns the LimitPerMinute field if non-nil, zero value otherwise.

### GetLimitPerMinuteOk

`func (o *RateLimitErrorRateLimit) GetLimitPerMinuteOk() (*int32, bool)`

GetLimitPerMinuteOk returns a tuple with the LimitPerMinute field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimitPerMinute

`func (o *RateLimitErrorRateLimit) SetLimitPerMinute(v int32)`

SetLimitPerMinute sets LimitPerMinute field to given value.

### HasLimitPerMinute

`func (o *RateLimitErrorRateLimit) HasLimitPerMinute() bool`

HasLimitPerMinute returns a boolean if a field has been set.

### GetRemaining

`func (o *RateLimitErrorRateLimit) GetRemaining() int32`

GetRemaining returns the Remaining field if non-nil, zero value otherwise.

### GetRemainingOk

`func (o *RateLimitErrorRateLimit) GetRemainingOk() (*int32, bool)`

GetRemainingOk returns a tuple with the Remaining field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRemaining

`func (o *RateLimitErrorRateLimit) SetRemaining(v int32)`

SetRemaining sets Remaining field to given value.

### HasRemaining

`func (o *RateLimitErrorRateLimit) HasRemaining() bool`

HasRemaining returns a boolean if a field has been set.

### GetResetInSeconds

`func (o *RateLimitErrorRateLimit) GetResetInSeconds() int32`

GetResetInSeconds returns the ResetInSeconds field if non-nil, zero value otherwise.

### GetResetInSecondsOk

`func (o *RateLimitErrorRateLimit) GetResetInSecondsOk() (*int32, bool)`

GetResetInSecondsOk returns a tuple with the ResetInSeconds field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResetInSeconds

`func (o *RateLimitErrorRateLimit) SetResetInSeconds(v int32)`

SetResetInSeconds sets ResetInSeconds field to given value.

### HasResetInSeconds

`func (o *RateLimitErrorRateLimit) HasResetInSeconds() bool`

HasResetInSeconds returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



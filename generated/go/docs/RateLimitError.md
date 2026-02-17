# RateLimitError

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Error** | Pointer to [**RateLimitErrorError**](RateLimitErrorError.md) |  | [optional] 
**RateLimit** | Pointer to [**RateLimitErrorRateLimit**](RateLimitErrorRateLimit.md) |  | [optional] 

## Methods

### NewRateLimitError

`func NewRateLimitError() *RateLimitError`

NewRateLimitError instantiates a new RateLimitError object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewRateLimitErrorWithDefaults

`func NewRateLimitErrorWithDefaults() *RateLimitError`

NewRateLimitErrorWithDefaults instantiates a new RateLimitError object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetError

`func (o *RateLimitError) GetError() RateLimitErrorError`

GetError returns the Error field if non-nil, zero value otherwise.

### GetErrorOk

`func (o *RateLimitError) GetErrorOk() (*RateLimitErrorError, bool)`

GetErrorOk returns a tuple with the Error field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetError

`func (o *RateLimitError) SetError(v RateLimitErrorError)`

SetError sets Error field to given value.

### HasError

`func (o *RateLimitError) HasError() bool`

HasError returns a boolean if a field has been set.

### GetRateLimit

`func (o *RateLimitError) GetRateLimit() RateLimitErrorRateLimit`

GetRateLimit returns the RateLimit field if non-nil, zero value otherwise.

### GetRateLimitOk

`func (o *RateLimitError) GetRateLimitOk() (*RateLimitErrorRateLimit, bool)`

GetRateLimitOk returns a tuple with the RateLimit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRateLimit

`func (o *RateLimitError) SetRateLimit(v RateLimitErrorRateLimit)`

SetRateLimit sets RateLimit field to given value.

### HasRateLimit

`func (o *RateLimitError) HasRateLimit() bool`

HasRateLimit returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



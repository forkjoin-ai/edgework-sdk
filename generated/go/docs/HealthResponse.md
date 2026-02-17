# HealthResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Status** | Pointer to **string** |  | [optional] 
**Timestamp** | Pointer to **time.Time** |  | [optional] 
**Gateway** | Pointer to [**HealthResponseGateway**](HealthResponseGateway.md) |  | [optional] 
**Providers** | Pointer to [**map[string]HealthResponseProviders**](HealthResponseProviders.md) |  | [optional] 
**RateLimits** | Pointer to [**HealthResponseRateLimits**](HealthResponseRateLimits.md) |  | [optional] 
**Cache** | Pointer to [**HealthResponseCache**](HealthResponseCache.md) |  | [optional] 

## Methods

### NewHealthResponse

`func NewHealthResponse() *HealthResponse`

NewHealthResponse instantiates a new HealthResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewHealthResponseWithDefaults

`func NewHealthResponseWithDefaults() *HealthResponse`

NewHealthResponseWithDefaults instantiates a new HealthResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetStatus

`func (o *HealthResponse) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *HealthResponse) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *HealthResponse) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *HealthResponse) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetTimestamp

`func (o *HealthResponse) GetTimestamp() time.Time`

GetTimestamp returns the Timestamp field if non-nil, zero value otherwise.

### GetTimestampOk

`func (o *HealthResponse) GetTimestampOk() (*time.Time, bool)`

GetTimestampOk returns a tuple with the Timestamp field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTimestamp

`func (o *HealthResponse) SetTimestamp(v time.Time)`

SetTimestamp sets Timestamp field to given value.

### HasTimestamp

`func (o *HealthResponse) HasTimestamp() bool`

HasTimestamp returns a boolean if a field has been set.

### GetGateway

`func (o *HealthResponse) GetGateway() HealthResponseGateway`

GetGateway returns the Gateway field if non-nil, zero value otherwise.

### GetGatewayOk

`func (o *HealthResponse) GetGatewayOk() (*HealthResponseGateway, bool)`

GetGatewayOk returns a tuple with the Gateway field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetGateway

`func (o *HealthResponse) SetGateway(v HealthResponseGateway)`

SetGateway sets Gateway field to given value.

### HasGateway

`func (o *HealthResponse) HasGateway() bool`

HasGateway returns a boolean if a field has been set.

### GetProviders

`func (o *HealthResponse) GetProviders() map[string]HealthResponseProviders`

GetProviders returns the Providers field if non-nil, zero value otherwise.

### GetProvidersOk

`func (o *HealthResponse) GetProvidersOk() (*map[string]HealthResponseProviders, bool)`

GetProvidersOk returns a tuple with the Providers field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProviders

`func (o *HealthResponse) SetProviders(v map[string]HealthResponseProviders)`

SetProviders sets Providers field to given value.

### HasProviders

`func (o *HealthResponse) HasProviders() bool`

HasProviders returns a boolean if a field has been set.

### GetRateLimits

`func (o *HealthResponse) GetRateLimits() HealthResponseRateLimits`

GetRateLimits returns the RateLimits field if non-nil, zero value otherwise.

### GetRateLimitsOk

`func (o *HealthResponse) GetRateLimitsOk() (*HealthResponseRateLimits, bool)`

GetRateLimitsOk returns a tuple with the RateLimits field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRateLimits

`func (o *HealthResponse) SetRateLimits(v HealthResponseRateLimits)`

SetRateLimits sets RateLimits field to given value.

### HasRateLimits

`func (o *HealthResponse) HasRateLimits() bool`

HasRateLimits returns a boolean if a field has been set.

### GetCache

`func (o *HealthResponse) GetCache() HealthResponseCache`

GetCache returns the Cache field if non-nil, zero value otherwise.

### GetCacheOk

`func (o *HealthResponse) GetCacheOk() (*HealthResponseCache, bool)`

GetCacheOk returns a tuple with the Cache field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCache

`func (o *HealthResponse) SetCache(v HealthResponseCache)`

SetCache sets Cache field to given value.

### HasCache

`func (o *HealthResponse) HasCache() bool`

HasCache returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)



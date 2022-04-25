## Streams

Customer.io is a REST API. This connector has the following streams:

* [Campaigns](https://customer.io/docs/api/#operation/listCampaigns) \(Incremental\)
* [Campaign Actions](https://customer.io/docs/api/#operation/listCampaignActions) \(Incremental\)
* [Newsletters](https://customer.io/docs/api/#operation/listNewsletters) \(Incremental\)

See [here](https://customer.io/docs/api/) for API documentation. Note that the
API is divided into three different API hosts: Track, App, and Beta. These hosts
provide access to different components of Customer.io, and each host has its own
request limits and authentication methods. The current connector streams all use
the [Beta API](https://customer.io/docs/api/#tag/betaOverview). In the future,
additional streams may use the other API hosts.

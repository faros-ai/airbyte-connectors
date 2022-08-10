## Streams

Phabricator is a REST API. This connector has the following streams:

- [Commits](https://secure.phabricator.com/conduit/method/diffusion.commit.search/) \(Incremental\)
- [Projects](https://secure.phabricator.com/conduit/method/project.search/) \(Incremental\)
- [Repositories](https://secure.phabricator.com/conduit/method/diffusion.repository.search/) \(Incremental\)
- [Revisions](https://secure.phabricator.com/conduit/method/differential.revision.search/) \(Incremental\)
- [Transactions](https://secure.phabricator.com/conduit/method/transaction.search/) \(Incremental\)
- [Users](https://secure.phabricator.com/conduit/method/user.search/) \(Incremental\)

See [here](https://secure.phabricator.com/conduit/) for API
documentation.

# The files of a build

This page explains one idea, which file of a build says what, and is not a runnable workspace.
[A web app with PostgreSQL, built up one step at a time](quickstart-web/README.md) shows it in a workspace you build;
write it into a folder of your own with:

```sh
aggrega scaffold --example quickstart-web
```

It then prints the commands to run next:

```sh
cd quickstart-web
cd 1
aggrega build --release release.yaml --auto-pull
export QUICKSTART_DB_PASSWORD=choose-a-password
docker compose -p quickstart-web -f dist/compose/docker-compose.yaml up -d --wait
# then open http://127.0.0.1:8080/ in your browser
```

## Five kinds of file, each with one author

A build reads five kinds of file. Each says one thing, and in a typical team each has its own author:

- a **Component** says what a kind of component is: the values a developer may set, the infrastructure settings an
  operator may set, what it publishes to the components that connect to it, and the sockets it connects through. The
  standard-library catalog carries the Components most applications need, such as `core/datastore/postgres` and
  `core/compute/server`, so a workspace usually writes none;
- an **Aggregate** is the developer's: which components the application has, and what each one connects to;
- a **Recipe** turns one kind of component into files for one tool — a Compose service, a Helm chart, a Terraform
  module;
- a **Manifest** chooses which Recipe realizes each kind of component for one target;
- a **Release** names an Aggregate and a Manifest and gives one environment's settings. It is what you build:
  `aggrega build --release release.yaml`.

The split is guidance: one person may write all five, and the build accepts any of them as long as each is valid.

## The Aggregate: components and their connections

The first step of the example is a web application and its database. Its Aggregate, from `1/aggregate.yaml` with its
comments left out:

```yaml
spec:
  components:
    web:
      type: core/compute/server
      features:
        db_password:
          type: core/secret-value
          values:
            key: PGPASSWORD
            origin: "${QUICKSTART_DB_PASSWORD}"
      uses:
        database:
          db:
            target: db
            inject:
              env:
                - in: PGHOST
                  from: host
                - in: PGPORT
                  from: port
                - in: PGUSER
                  from: user
                - in: PGDATABASE
                  from: database

    db:
      type: core/datastore/postgres
      features:
        password:
          type: core/secret-value
          values:
            key: POSTGRES_PASSWORD
            origin: "${QUICKSTART_DB_PASSWORD}"
```

Nothing here names a port, a host, a namespace or a tool. `web` connects to `db` through its `database` socket, and
the `inject` list says which variable of the application receives each entry the database publishes: `from:` names
the entry, `in:` the variable.

## A connection is a string, piped

The database's Recipe publishes `host`, `port`, `user` and `database` for the connection to read. Which address `host`
holds follows the Recipe the Manifest chose: a service's name where the database runs beside the application, a
pointer string a provisioning tool resolves for a managed database, or the address of a server that already exists.
The build copies each published string into the variable the Aggregate named and
does not interpret it: it never resolves an address or checks that one is reachable.

## The Manifest and the Release

The Manifest, from `1/manifest.yaml`, binds each kind of component, and the password attachments, to the Recipe
that realizes it on Docker Compose:

```yaml
spec:
  mappings:
    components:
      type:
        core/compute/server:1.0.0: compose/server:1.0.0
        core/datastore/postgres:1.0.0: compose/postgres:1.0.0
    features:
      type:
        core/secret-value:1.0.0: compose/dotenv-secret:1.0.0
```

The Release, from `1/release.yaml`, names the Aggregate and the Manifest and gives what only an environment knows,
here the image the application runs and the port it listens on (the image's digest shortened):

```yaml
spec:
  aggregate: quickstart-web
  manifest: quickstart-web-compose
  components:
    web:
      infra:
        image: hub.aggrega.ai/tools/quickstart-web:1.0.0@sha256:…
        port: 8080
    db: {}
```

The example's later steps grow it: a Redis cache beside the database, then the same components on AWS through
Terraform, then the database's backups.

## Parameters: one Aggregate, many environments

A value that differs between environments is declared in the Aggregate as a typed parameter, referenced where it is
used, and given by each Release. In [A task run on demand](task-run-on-demand/README.md), the
Aggregate declares the schedule of its report:

```yaml
spec:
  parameters:
    report_schedule:
      type: string
      default: ""
  components:
    report:
      type: core/compute/task
      values:
        schedule: "{{ .parameters.report_schedule }}"
```

and a Release fulfils it:

```yaml
spec:
  parameters:
    report_schedule: "30 2 * * 1-5"
```

The build checks each value a Release gives against the parameter's type before it fills the template. A Release
never writes a component's `values` itself: it fulfils the parameters the Aggregate exposes, so the Aggregate stays
the one place that says which values vary by environment. A Release can also read its parameters from a file of
their own, `parameters: { $import: ./env/prod-values.yaml }`.

# CI/CD Setup – Deploy to AWS ECS (api.olytraining.com)

This project uses **GitHub Actions** to build and deploy to AWS ECS when code is merged into `main`.

## How it works

1. You push or merge to the **`main`** branch (or run the workflow manually).
2. GitHub Actions:
   - Builds the Docker image from the repo `Dockerfile`.
   - Pushes the image to **Amazon ECR** (tagged with git SHA and `latest`).
   - Updates the **ECS service** with a new deployment so it pulls the new image.
   - Waits until the ECS service is stable.

Your API at **https://api.olytraining.com** will serve the new version once the deployment finishes.

## Required GitHub Secrets

In your GitHub repo: **Settings → Secrets and variables → Actions**, add these **Repository secrets**:

| Secret name | Description | Example |
|-------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | IAM user access key with ECR + ECS permissions | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | (from IAM) |
| `AWS_REGION` | Region where ECS and ECR live | `eu-north-1` or `us-east-1` |
| `ECR_REPOSITORY` | ECR repository name (not full URI) | `oly-backend` |
| `ECS_CLUSTER` | ECS cluster name | `oly-cluster` |
| `ECS_SERVICE` | ECS service name | `oly-backend-service` |
| `CONTAINER_NAME` | (Optional) Container name in the ECS task definition | `oly-backend` |

### IAM permissions

The IAM user (or role) used by the workflow needs at least:

- **ECR:** `GetAuthorizationToken`, and for the repo: `BatchCheckLayerAvailability`, `GetDownloadUrlForLayer`, `BatchGetImage`, `PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`.
- **ECS:** `DescribeServices`, `UpdateService`, `DescribeTasks`, `DescribeTaskDefinition` (and any permissions required for your task execution role).

You can use the managed policies **`AmazonEC2ContainerRegistryPowerUser`** (or **FullAccess**) for ECR and **`AmazonECS_FullAccess`** for ECS, or create a custom policy with the actions above.

## ECS task definition

Your ECS **task definition** should point to the same ECR repository and use either:

- Tag **`latest`** (recommended for this pipeline), or  
- A specific image tag that you update when deploying.

The workflow pushes both `latest` and the git SHA tag; **force new deployment** makes ECS pull the new image (e.g. `latest`) and roll out the new tasks.

## Manual deploy

You can run the same pipeline without pushing to `main`:

1. Open the repo on GitHub.
2. Go to **Actions → Deploy to ECS**.
3. Click **Run workflow**, choose branch (e.g. `main`), then **Run workflow**.

## Workflow file

The workflow is defined in:

```
.github/workflows/deploy-ecs.yml
```

It runs on:

- **Push** to `main`
- **Manual trigger** via **Actions → Deploy to ECS → Run workflow**

## Troubleshooting

- **“Unable to locate credentials”**  
  Check that `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in GitHub Actions secrets.

- **“Repository does not exist”**  
  Ensure `ECR_REPOSITORY` is the repository **name** (e.g. `oly-backend`), not the full URI. Create the repo in ECR if it doesn’t exist.

- **“Cluster not found” / “Service not found”**  
  Verify `ECS_CLUSTER` and `ECS_SERVICE` match your ECS cluster and service names in the same `AWS_REGION`.

- **Deployment never stabilizes**  
  Check ECS service events and task logs (e.g. CloudWatch). Ensure the container starts (e.g. correct port, env vars, and health checks).

- **App uses env vars (e.g. MongoDB, S3)**  
  Configure them in the ECS task definition (task definition env or secrets), not in the workflow, so the running container has the right config.

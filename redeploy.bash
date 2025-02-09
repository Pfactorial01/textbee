#!/bin/bash

# Stop and remove existing container
sudo docker stop api_cont || true
sudo docker rm api_cont || true

# Remove existing image
sudo docker rmi api || true

# Build new image
sudo docker build -t api api/.

# Run new container
sudo docker run -d --name  api_cont --privileged --network host \
  -e MONGO_URI=mongodb://172.17.0.3:27017/ \
    api
  # -p 3005:3005 \
  # -p 5037:5037 \


# Stop and remove existing container
sudo docker stop new_portal_cont || true
sudo docker rm new_portal_cont || true

# Remove existing image
sudo docker rmi new_portal || true

# Build new image
sudo docker build -t new_portal new_portal/.

sudo docker run -d --name new_portal_cont -p 8000:8000 new_portal

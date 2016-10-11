// Copyright 2015 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Gulp tasks for deploying and releasing the application.
 */
import child from 'child_process';
import gulp from 'gulp';
import lodash from 'lodash';
import path from 'path';
import gutil from 'gulp-util';

import conf from './conf';
import {multiDest} from './multidest';

/**
 * @param {!Array<string>} args
 * @param {function(?Error=)} doneFn
 */
function spawnDockerProcess(args, doneFn) {
  let dockerTask = child.spawn('docker', args, {stdio: 'inherit'});

  // Call Gulp callback on task exit. This has to be done to make Gulp dependency management
  // work.
  dockerTask.on('exit', function(code) {
    if (code === 0) {
      doneFn();
    } else {
      doneFn(new Error(`Docker command error, code: ${code}`));
    }
  });
}

/**
 * Creates canary Docker image for the application for current architecture.
 * The image is tagged with the image name configuration constant.
 */
gulp.task('docker-image:canary', ['build', 'docker-file'], function(doneFn) {
  buildDockerImage([[conf.deploy.canaryImageName, conf.paths.dist]], doneFn);
});

/**
 * Creates release Docker image for the application for current architecture.
 * The image is tagged with the image name configuration constant.
 */
gulp.task('docker-image:release', ['build', 'docker-file'], function(doneFn) {
  buildDockerImage([[conf.deploy.releaseImageName, conf.paths.dist]], doneFn);
});

/**
 * Creates canary Docker image for the application for all architectures.
 * The image is tagged with the image name configuration constant.
 */
gulp.task('docker-image:canary:cross', ['build:cross', 'docker-file:cross'], function(doneFn) {
  buildDockerImage(lodash.zip(conf.deploy.canaryImageNames, conf.paths.distCross), doneFn);
});

/**
 * Creates release Docker image for the application for all architectures.
 * The image is tagged with the image name configuration constant.
 */
gulp.task('docker-image:release:cross', ['build:cross', 'docker-file:cross'], function(doneFn) {
  buildDockerImage(lodash.zip(conf.deploy.releaseImageNames, conf.paths.distCross), doneFn);
});

/**
 * Pushes cross-compiled canary images to GCR.
 */
gulp.task('push-to-gcr:canary', ['docker-image:canary:cross'], function(doneFn) {
  pushToGcr(conf.deploy.versionCanary, doneFn);
});

/**
 * Pushes cross-compiled release images to GCR.
 */
gulp.task('push-to-gcr:release', ['docker-image:release:cross'], function(doneFn) {
  pushToGcr(conf.deploy.versionRelease, doneFn);
});

/**
 * Processes the Docker file and places it in the dist folder for building.
 */
gulp.task('docker-file', ['clean-dist'], function() {
  dockerFile(conf.paths.dist);
});

/**
 * Processes the Docker file and places it in the dist folder for all architectures.
 */
gulp.task('docker-file:cross', ['clean-dist'], function() {
  dockerFile(conf.paths.distCross);
});

/**
 * @param {!Array<!Array<string>>} imageNamesAndDirs (image name, directory) pairs
 * @return {!Promise}
 */
function buildDockerImage(imageNamesAndDirs) {
  let spawnPromises = imageNamesAndDirs.map((imageNameAndDir) => {
    let [imageName, dir] = imageNameAndDir;
    return new Promise((resolve, reject) => {
      spawnDockerProcess(
          [
            'build',
            // Remove intermediate containers after a successful build.
            '--rm=true',
            '--tag',
            imageName,
            dir,
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
    });
  });

  return Promise.all(spawnPromises);
}

/**
 * @param {string} version
 * @param {function(?Error=)} doneFn
 */
function pushToGcr(version, doneFn) {
  let imageUri = `${conf.deploy.imageName}:${version}`;

  let childTask = child.spawn('gcloud', ['docker', 'push', imageUri], {stdio: 'inherit'});

  childTask.on('exit', function(code) {
    if (code === 0) {
      doneFn();
    } else {
      doneFn(new Error(`gcloud command error, code: ${code}`));
    }
  });
}

/**
 * @param {string|!Array<string>} outputDirs
 * @return {stream}
 */
function dockerFile(outputDirs) {
  return gulp.src(path.join(conf.paths.deploySrc, 'Dockerfile')).pipe(multiDest(outputDirs));
}

/**
 * Travis CI part underneath manages automatic docker build & push.
 *
 * All images are pushed to Docker Hub. Image version is determined in 'travis.yml' based on
 * '$TRAVIS_PULL_REQUEST' and '$TRAVIS_BRANCH' env. variables.
 *
 * NOTE: Only default architecture (amd64) is supported.
 *
 * Arguments of 'gulp docker-image' & 'gulp push-to-docker':
 *  - --pr <number> - creates image name with version set to PR number
 *  - --canary - creates image name with version set to 'canary'
 */

/**
 * Creates canary Docker image for the application for current architecture.
 * The image is tagged with the image name configuration constant.
 */
gulp.task('docker-image', ['build', 'docker-file'], function() {
  return buildDockerImage([[createImageName(), conf.paths.dist]]);
});

/**
 * Pushes compiled docker image for current architecture to Docker Hub.
 */
gulp.task('push-to-docker', ['docker-image'], function(doneFn) {
  pushToDocker(createImageName(), doneFn);
});

/**
 * @param {string} imageName
 * @param {function(?Error=)} doneFn
 */
function pushToDocker(imageName, doneFn) {
  let childTask = child.spawn('docker', ['push', imageName], {stdio: 'inherit'});

  childTask.on('exit', function(code) {
    if (code === 0) {
      doneFn();
    } else {
      doneFn(new Error(`docker command error, code: ${code}`));
    }
  });
}

/**
 * Returns value for the process argument key passed to gulp task. Null if there is no value for
 * given key.
 *
 * @param {string} key
 * @return {string|boolean}
 */
function getArg(key) {
  var index = process.argv.indexOf(key);
  var next = process.argv[index + 1];
  return (index < 0) ? null : (!next || next[0] === "-") ? true : next;
}

/**
 * Returns name for docker image. By default canary image for Docker Hub repository is returned.
 *
 * @return {string}
 */
function createImageName() {
  let prNumber = getArg('--pr');
  let isCanary = getArg('--canary');

  if(!isCanary) {
    return `${conf.repo.docker}/${conf.deploy.imageNameBase}:${prNumber}`;
  }

  return `${conf.repo.docker}/${conf.deploy.imageNameBase}:${conf.deploy.version.canary}`;
}

// Copyright 2017 The Kubernetes Authors.
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

package options

import (
	"net"
	"os"

	cliflag "k8s.io/component-base/cli/flag"
)

type APIServerRunOptions struct {
	InsecurePort        int
	InsecureBindAddress net.IP

	Port        int
	BindAddress net.IP

	CertDir     string
	CertFile    string
	CertKeyFile string

	APIServerHost  string
	KubeconfigFile string

	TokenTTL                 int
	AuthenticationMode       []string
	AutogenerateCertificates bool

	Namespace    string
	LocaleConfig string
}

func (s *APIServerRunOptions) Flags() (fss cliflag.NamedFlagSets) {
	fs := fss.FlagSet("api")
	fs.IntVar(&s.InsecurePort, "insecure-port", s.InsecurePort, "The port to listen to for incoming HTTP requests.")
	fs.IPVar(&s.InsecureBindAddress, "insecure-bind-address", s.InsecureBindAddress, "The IP address on which to serve the --insecure-port.")

	fs.IntVar(&s.Port, "port", s.Port, "The secure port to listen to for incoming HTTPS requests.")
	fs.IPVar(&s.BindAddress, "bind-address", s.BindAddress, "The IP address on which to serve the --port.")

	fs.StringVar(&s.CertDir, "cert-dir", s.CertDir, "Directory path containing '--tls-cert-file' and '--tls-key-file' files. Used also when auto-generating certificates flag is set.")
	fs.StringVar(&s.CertFile, "tls-cert-file", s.CertFile, "File containing the default x509 Certificate for HTTPS.")
	fs.StringVar(&s.CertKeyFile, "tls-key-file", s.CertKeyFile, "File containing the default x509 private key matching --tls-cert-file.")

	fs.StringVar(&s.APIServerHost, "apiserver-host", s.APIServerHost, "The address of the Kubernetes Apiserver "+
		"to connect to in the format of protocol://address:port, e.g., "+
		"http://localhost:8080. If not specified, the assumption is that the binary runs inside a "+
		"Kubernetes cluster and local discovery is attempted.")
	fs.StringVar(&s.KubeconfigFile, "kubeconfig", s.KubeconfigFile, "Path to kubeconfig file with authorization and master location information.")

	fs.IntVar(&s.TokenTTL, "token-ttl", s.TokenTTL, "Expiration time (in seconds) of JWE tokens generated by dashboard. '0' never expires.")
	fs.StringSliceVar(&s.AuthenticationMode, "authentication-mode", s.AuthenticationMode, "Enables authentication options that will be reflected on login screen. Supported values: token, basic. "+
		"Note that basic option should only be used if apiserver has '--authorization-mode=ABAC' and '--basic-auth-file' flags set.")
	fs.BoolVar(&s.AutogenerateCertificates, "auto-generate-certificates", s.AutogenerateCertificates, "When set to true, Dashboard will automatically generate certificates used to serve HTTPS.")

	fs.StringVar(&s.Namespace, "namespace", s.Namespace, "When non-default namespace is used, create encryption key in the specified namespace.")
	fs.StringVar(&s.LocaleConfig, "locale-config", s.LocaleConfig, "File containing the configuration of locales.")

	return fss
}

func NewAPIServerRunOption() *APIServerRunOptions {
	return &APIServerRunOptions{
		InsecurePort:             9090,
		InsecureBindAddress:      net.IPv4(127, 0, 0, 1),
		Port:                     8443,
		BindAddress:              net.IPv4(0, 0, 0, 0),
		CertDir:                  "/certs",
		TokenTTL:                 900, // TODO: take from auth api defaults
		AuthenticationMode:       []string{"token" /** TODO: same as above **/},
		AutogenerateCertificates: false,
		Namespace:                getEnv("POD_NAMESPACE", "kube-system"),
		LocaleConfig:             "./locale_conf.json",
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		value = fallback
	}
	return value
}

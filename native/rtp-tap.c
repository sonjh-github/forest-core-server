#define _GNU_SOURCE
#include <arpa/inet.h>
#include <dlfcn.h>
#include <errno.h>
#include <pthread.h>
#include <stdint.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>

// Only this child process's checked camera peer is observed. No packets are changed.
static ssize_t (*original_recv)(int,void*,size_t,int);
static _Atomic int sink=-1;
static int port=0;
static struct in_addr peer;
static pthread_mutex_t lock=PTHREAD_MUTEX_INITIALIZER;
static uint64_t micros(clockid_t id) {struct timespec t;clock_gettime(id,&t);return (uint64_t)t.tv_sec*1000000+t.tv_nsec/1000;}
static void put32(unsigned char *p,uint32_t v) {for(int i=3;i>=0;i--){p[i]=v&255;v>>=8;}}
static void put64(unsigned char *p,uint64_t v) {for(int i=7;i>=0;i--){p[i]=v&255;v>>=8;}}
static int emit(const void *data,size_t n) {
  const unsigned char *p=data;
  while(n) {ssize_t sent=send(sink,p,n,MSG_NOSIGNAL);if(sent<0 && errno==EINTR)continue;if(sent<=0)return 0;p+=sent;n-=sent;}
  return 1;
}
__attribute__((constructor)) static void setup(void) {
  original_recv=dlsym(RTLD_NEXT,"recv");
  const char *fd=getenv("CAMERA_RTP_TAP_FD"),*ip=getenv("CAMERA_RTP_TAP_IP"),*p=getenv("CAMERA_RTP_TAP_PORT");
  if(fd && ip && p && inet_pton(AF_INET,ip,&peer)==1){sink=atoi(fd);port=atoi(p);}
}
ssize_t recv(int fd,void *buf,size_t size,int flags) {
  if(!original_recv){errno=ENOSYS;return -1;}
  ssize_t n=original_recv(fd,buf,size,flags);int saved=errno;
  if(n>0 && sink>=0 && !(flags&MSG_PEEK)) {
    struct sockaddr_in address;socklen_t length=sizeof(address);
    if(getpeername(fd,(struct sockaddr*)&address,&length)==0 && address.sin_family==AF_INET && address.sin_addr.s_addr==peer.s_addr && ntohs(address.sin_port)==port) {
      uint64_t wall=micros(CLOCK_REALTIME),tick=micros(CLOCK_MONOTONIC);
      pthread_mutex_lock(&lock);
      for(size_t offset=0;offset<(size_t)n;) {
        size_t count=(size_t)n-offset;if(count>65536)count=65536;
        unsigned char header[28];memcpy(header,"RTAP",4);put32(header+4,fd);put32(header+8,count);put64(header+12,wall);put64(header+20,tick);
        if(!emit(header,sizeof(header)) || !emit((unsigned char*)buf+offset,count)){sink=-1;break;}
        offset+=count;
      }
      pthread_mutex_unlock(&lock);
    }
  }
  errno=saved;return n;
}
